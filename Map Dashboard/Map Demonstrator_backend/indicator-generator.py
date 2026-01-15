

import argparse
import csv
import os
from pathlib import Path

try:
    import fiona
except Exception as exc:
    raise SystemExit(
        "Fiona is required to run this script. Install it with 'pip install fiona' or 'conda install -c conda-forge fiona'.\n"
        f"Import error: {exc}"
    )


def norm_sa1(x: str) -> str:
    s = "".join(ch for ch in str(x) if ch.isdigit())
    if len(s) < 11:
        s = s.zfill(11)
    return s


def norm_dzn(x: str) -> str:
    """Normalise DZN codes to a simple digit string (typically 9 digits)."""
    s = "".join(ch for ch in str(x) if ch.isdigit())
    return s


def norm_mb(x: str) -> str:
    """Normalise MB codes to a digit string."""
    s = "".join(ch for ch in str(x) if ch.isdigit())
    return s


DATASETS = {
    "education": "Education-VIC.csv",
    "employment": "employment-VIC.csv",
    "income": "Income-VIC1.csv",
    "pob": "POB-VIC1.csv",
    "occupation": "Occupation-VIC.csv",
    # DZN-based indicators typically upload arbitrary CSV; names here are placeholders and not used when API is called
    "land use mix": None,
    "land_use_mix": None,
    "landusemix": None,
    "total number of jobs": None,
    "total_jobs": None,
    "jobs_total": None,
    "industry specialisation": None,
    "industry_specialisation": None,
    "industryspecialisation": None,
}


def resolve_paths(data_dir: Path, *, scale: str):
    base = Path(data_dir).expanduser()
    shp_candidates: list[str]
    if scale == "dzn":
        shp_candidates = ["Melb_DNZ_21.shp"]
    elif scale == "mb":
        shp_candidates = [
            "MB_2021_AUST_GDA2020.shp",
            "MB_2021_AUST.shp",
            "MB_2021_VIC_GDA2020.shp",
        ]
    else:  # sa1 default
        shp_candidates = ["SA1_2021_AUST_GDA2020.shp", "SA1_2021_AUST.shp"]
    shp_path = None
    for name in shp_candidates:
        p = (base / name).expanduser()
        if p.exists():
            shp_path = p
            break
    if shp_path is None:
        # choose first as expected and let caller know
        shp_path = (base / shp_candidates[0]).expanduser()
    return base, shp_path


def parse_target_ids(ids_arg: str | None, ids_file: str | None):
    if ids_arg:
        return {norm_sa1(x) for x in ids_arg.split(",") if x.strip()}
    if ids_file:
        p = Path(ids_file).expanduser()
        if not p.exists():
            raise FileNotFoundError(f"IDs file not found: {p}")
        with open(p, "r", encoding="utf-8") as f:
            return {norm_sa1(line.strip()) for line in f if line.strip()}
    # When not explicitly provided (e.g., via API), we will instead derive IDs from CSV content.
    return set()


def detect_id_field(row: dict, *, scale: str) -> str | None:
    sa1_candidates = ["SA1 (UR)", "SA1_CODE21", "SA1_CODE_2021", "SA1_CODE", "SA1_2021"]
    dzn_candidates = ["DZN_21", "DZN_CODE21", "DZN_CODE_2021", "DZN_CODE"]
    mb_candidates = ["MB_CODE21", "MB_CODE_2021", "MB_CODE"]
    candidates = dzn_candidates if scale == "dzn" else (mb_candidates if scale == "mb" else sa1_candidates)
    for k in candidates:
        if k in row and str(row[k]).strip():
            return k
    # Heuristic fallback: any column name containing 'dzn' or 'sa1'
    for k in row.keys():
        if scale == 'dzn' and 'dzn' in k.lower():
            return k
        if scale == 'mb' and 'mb_code' in k.lower():
            return k
        if scale == 'sa1' and 'sa1' in k.lower():
            return k
    return None


def detect_scale_from_header(row: dict) -> str | None:
    """Infer the spatial scale from CSV header keys if possible.

    Returns one of 'dzn' | 'mb' | 'sa1' | None.
    """
    keys = set(k.lower() for k in row.keys())
    if any(k in keys for k in ["dzn_21", "dzn_code21", "dzn_code_2021", "dzn_code", "dznid"]):
        return "dzn"
    if any(k in keys for k in ["mb_code21", "mb_code_2021", "mb_code"]):
        return "mb"
    if any(k in keys for k in ["sa1 (ur)", "sa1_code21", "sa1_code_2021", "sa1_code", "sa1_2021"]):
        return "sa1"
    return None


def load_target_features(shp_path: Path, key_field: str | None, target_ids: set[str] | None, *, scale: str):
    """Read shapefile and cache geometry for matching IDs (if provided).

    - If key_field is None, auto-detect the most likely ID field from the schema.
    - If target_ids is empty or None, include all features and return a mapping from
      normalised code -> geometry.
    """
    cached = {}
    with fiona.open(str(shp_path)) as src:
        crs = src.crs
        props_schema = set((src.schema or {}).get("properties", {}).keys())
        if key_field is None or key_field not in props_schema:
            candidates = {
                'dzn': ["DZN_21", "DZN_CODE21", "DZN_CODE_2021", "DZN_CODE", "DZN_2021", "DZNID"],
                'sa1': ["SA1_CODE21", "SA1_2021", "SA1_CODE_2021", "SA1_CODE", "SA1 (UR)"],
                'mb': ["MB_CODE21", "MB_CODE_2021", "MB_CODE"],
            }[scale]
            for c in candidates:
                if c in props_schema:
                    key_field = c
                    break
        if key_field is None:
            raise KeyError(
                f"Could not detect key field in shapefile {shp_path.name}. Available fields: {sorted(list(props_schema))}"
            )

        norm = norm_dzn if scale == 'dzn' else (norm_mb if scale == 'mb' else norm_sa1)
        for feat in src:
            prop_val = feat["properties"].get(key_field, "")
            code = norm(prop_val)
            if not target_ids or code in target_ids:
                cached[code] = feat["geometry"]
    return crs, cached


def generate_geojson_from_csv(
    *,
    dataset: str,
    csv_path: Path,
    data_dir: Path | None = None,
    target_ids: set[str] | None = None,
    out_dir: Path | None = None,
    scale: str | None = None,
) -> Path:
    """
    Programmatic API: Generate a GeoJSON for a single dataset using an explicit CSV file.

    Parameters:
    - dataset: one of {education, employment, income, pob, occupation}
    - csv_path: path to the uploaded CSV file
    - data_dir: directory containing the SA1 shapefile (SA1_2021_AUST_GDA2020.shp)
    - target_ids: set of SA1 codes to include; if None, defaults to script's default subset
    - out_dir: directory to write output; defaults to data_dir

    Returns: Path to the generated GeoJSON file.
    """
    d = dataset.strip().lower()
    if d not in DATASETS:
        valid = ", ".join(DATASETS.keys())
        raise ValueError(f"Unknown dataset: {dataset}. Valid: {valid}")

    # Determine scale if not explicitly provided
    if scale:
        scale = scale.lower()
    if scale not in {"sa1", "mb", "dzn", None}:
        raise ValueError(f"Unknown scale: {scale}. Use one of sa1|mb|dzn")
    inferred_dzn = d in {"land use mix", "land_use_mix", "landusemix", "total number of jobs", "total_jobs", "jobs_total", "industry specialisation", "industry_specialisation", "industryspecialisation"}
    scale = scale or ("dzn" if inferred_dzn else "sa1")

    if data_dir is None:
        data_dir = Path(os.environ.get("FILTER_DATA_DIR") or (Path(__file__).resolve().parent / "Data for indicators")).expanduser()
    else:
        data_dir = Path(data_dir).expanduser()

    base, shp_path = resolve_paths(data_dir, scale=scale)
    if not shp_path.exists():
        raise FileNotFoundError(f"SHP not found: {shp_path}")

    csv_path = Path(csv_path).expanduser()
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    if target_ids is None:
        # We'll derive target IDs from CSV content below (more inclusive)
        target_ids = set()

    out_dir = Path(out_dir or base).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"selected_{scale}_{d.replace(' ', '_')}.geojson"

    # Load CSV for this dataset
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    if not rows:
        raise ValueError(f"No rows read from CSV: {csv_path}")

    # Detect join field and build lookup
    id_field = detect_id_field(rows[0], scale=scale)
    if not id_field:
        # Try to infer scale from header and provide a clear error on mismatch
        csv_scale = detect_scale_from_header(rows[0])
        if csv_scale and csv_scale != scale:
            raise ValueError(
                f"Spatial scale mismatch: CSV appears to use '{csv_scale.upper()}' identifiers but you selected '{scale.upper()}'."
                " Please choose the correct Spatial scale and try again."
            )
        expected = {"dzn": "DZN_21/DZN_CODE21", "sa1": "SA1 (UR)/SA1_CODE21", "mb": "MB_CODE21/MB_CODE_2021"}[scale]
        raise KeyError(
            f"Could not detect identifier column in {csv_path}. Expected something like {expected}."
        )
    norm_fn = norm_dzn if scale == 'dzn' else (norm_mb if scale == 'mb' else norm_sa1)
    id_key = {"dzn": "DZN_21", "sa1": "SA1_CODE21", "mb": "MB_CODE21"}[scale]
    for r in rows:
        r[id_key] = norm_fn(r.get(id_field, ""))
    by_id = {r[id_key]: {k: r[k] for k in r if k != id_key} for r in rows}

    # Derive target IDs from CSV when not provided
    if not target_ids:
        target_ids = set(by_id.keys())

    # Load target geometries for provided/derived ids
    crs, target_geoms = load_target_features(shp_path, key_field=id_key, target_ids=target_ids, scale=scale)
    if not target_geoms:
        raise ValueError("No target geometries found in shapefile for the provided IDs.")

    # Build schema (allow mixed Polygon/MultiPolygon)
    prop_keys = [k for k in rows[0].keys() if k != id_key]
    # Ensure ID and computed fields are present
    out_schema = {"geometry": "Unknown", "properties": {(
        "DZN_21" if scale == 'dzn' else ("MB_CODE21" if scale == 'mb' else "SA1_CODE")
    ): "str"}}
    for k in prop_keys:
        out_schema["properties"][k] = "str"
    # Placeholder for computed Industry Specialisation
    if d in {"industry specialisation", "industry_specialisation", "industryspecialisation"}:
        out_schema["properties"]["Industry Specialisation_21"] = "float"
    # Placeholder for computed Total number of jobs (2021)
    is_tot_jobs = d in {"total number of jobs", "total_jobs", "jobs_total"}
    if is_tot_jobs:
        out_schema["properties"]["Total number of jobs_2021"] = "float"

    # Write GeoJSON using cached geometries
    def try_float(x):
        try:
            return float(str(x).replace(",", ""))
        except Exception:
            return None

    # Predefine industry columns (match if present in CSV header)
    INDUSTRY_COLUMNS = [
        "Agriculture, Forestry and Fishing",
        "Mining",
        "Manufacturing",
        "Electricity, Gas, Water and Waste Services",
        "Construction",
        "Wholesale Trade",
        "Retail Trade",
        "Accommodation and Food Services",
        "Transport, Postal and Warehousing",
        "Information Media and Telecommunications",
        "Financial and Insurance Services",
        "Rental, Hiring and Real Estate Services",
        "Professional, Scientific and Technical Services",
        "Administrative and Support Services",
        "Public Administration and Safety",
        "Education and Training",
        "Health Care and Social Assistance",
        "Arts and Recreation Services",
        "Other Services",
    ]

    is_ind_spec = d in {"industry specialisation", "industry_specialisation", "industryspecialisation"}

    with fiona.open(str(out_path), "w", driver="GeoJSON", crs=crs, schema=out_schema) as dst:
        for code in target_ids:
            geom = target_geoms.get(code)
            if not geom:
                continue
            attrs = by_id.get(code, {})
            props = {k: "" for k in out_schema["properties"].keys()}
            # Write ID under appropriate name
            if scale == 'dzn':
                props["DZN_21"] = code
            elif scale == 'mb':
                props["MB_CODE21"] = code
            else:
                props["SA1_CODE"] = code

            # Copy attributes as strings
            for k in prop_keys:
                if k in attrs:
                    props[k] = str(attrs[k])

            # Compute Industry Specialisation if requested
            if is_ind_spec:
                # Choose available columns in this CSV
                cols = [c for c in INDUSTRY_COLUMNS if c in attrs]
                if not cols:
                    # Fallback: use all numeric columns except id
                    cols = [k for k, v in attrs.items() if try_float(v) is not None and k not in {id_key}]
                vals = [try_float(attrs.get(c)) or 0.0 for c in cols]
                total = sum(vals)
                ind_val = 0.0
                if total > 0:
                    ind_val = sum(((v / total) ** 2 for v in vals))
                props["Industry Specialisation_21"] = ind_val

            # Compute Total number of jobs (sum over industry columns)
            if is_tot_jobs:
                cols_jobs = [c for c in INDUSTRY_COLUMNS if c in attrs]
                vals_jobs = [try_float(attrs.get(c)) or 0.0 for c in cols_jobs]
                total_jobs = float(sum(vals_jobs))
                props["Total number of jobs_2021"] = total_jobs

            dst.write({"type": "Feature", "geometry": geom, "properties": props})

    return out_path


def main():
    parser = argparse.ArgumentParser(description="Generate selected SA1 GeoJSONs for multiple datasets")
    parser.add_argument(
        "-d",
        "--data-dir",
        default=os.environ.get("FILTER_DATA_DIR")
        or (Path(__file__).resolve().parent / "Data for indicators"),
        help="Directory containing input CSV and SHP (default: workspace 'Data for indicators')",
    )
    parser.add_argument(
        "--dataset",
        default="all",
        help="Dataset to process: one of {education,employment,income,pob,occupation} or 'all' (DZN-based indicators are API-only)",
    )
    parser.add_argument(
        "--ids",
        help="Comma-separated SA1 IDs to include (defaults to FB subset).",
    )
    parser.add_argument(
        "--ids-file",
        help="Path to a file containing SA1 IDs (one per line).",
    )
    args = parser.parse_args()

    # Default to SA1 run when using CLI
    base, shp_path = resolve_paths(Path(args.data_dir), scale='sa1')

    # Determine datasets to run
    SA1_ONLY = ["education", "employment", "income", "pob", "occupation"]
    if args.dataset.lower() == "all":
        to_run = SA1_ONLY
    else:
        to_run = [d.strip().lower() for d in args.dataset.split(",") if d.strip()]
        invalid = [d for d in to_run if d not in SA1_ONLY]
        if invalid:
            valid = ", ".join(SA1_ONLY)
            raise SystemExit(f"Unknown dataset(s): {', '.join(invalid)}. Valid: {valid} or 'all'.")

    # Validate inputs
    missing = []
    if not shp_path.exists():
        missing.append(f"SHP not found: {shp_path}")
    for d in to_run:
        csv_path = (base / DATASETS[d]).expanduser()
        if not csv_path.exists():
            missing.append(f"CSV not found for {d}: {csv_path}")
    if missing:
        details = "\n".join(missing)
        raise FileNotFoundError(
            f"\n{details}\nData directory used: {base}\n"
            "Ensure files exist under the expected data directory or pass --data-dir."
        )

    # Target SA1 IDs
    target_ids = parse_target_ids(args.ids, args.ids_file)

    # Cache target geometries once (SA1 for CLI)
    crs, target_geoms = load_target_features(shp_path, key_field=None, target_ids=target_ids, scale='sa1')
    if not target_geoms:
        raise ValueError("No target SA1 geometries found in shapefile for the provided IDs.")

    out_files = []
    for d in to_run:
        csv_path = (base / DATASETS[d]).expanduser()
        out_path = (base / f"selected_sa1_{d}.geojson").expanduser()
        out_path.parent.mkdir(parents=True, exist_ok=True)

        # Load CSV for this dataset
        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        if not rows:
            raise ValueError(f"No rows read from CSV: {csv_path}")

        # Detect SA1 field and build lookup
        sa1_field = detect_id_field(rows[0], scale='sa1')
        if not sa1_field:
            raise KeyError(
                f"Could not detect SA1 column in {csv_path}. Expected one of 'SA1 (UR)', 'SA1_CODE21', etc."
            )
        for r in rows:
            r["SA1_CODE21"] = norm_sa1(r.get(sa1_field, ""))
        by_sa1 = {r["SA1_CODE21"]: {k: r[k] for k in r if k != "SA1_CODE21"} for r in rows}

        # Build schema (allow mixed Polygon/MultiPolygon)
        prop_keys = [k for k in rows[0].keys() if k != "SA1_CODE21"]
        out_schema = {"geometry": "Unknown", "properties": {"SA1_CODE": "str"}}
        for k in prop_keys:
            out_schema["properties"][k] = "str"

        # Write GeoJSON using cached geometries
        with fiona.open(str(out_path), "w", driver="GeoJSON", crs=crs, schema=out_schema) as dst:
            for sa1 in target_ids:
                geom = target_geoms.get(sa1)
                if not geom:
                    continue
                attrs = by_sa1.get(sa1, {})
                props = {k: "" for k in out_schema["properties"].keys()}
                props["SA1_CODE"] = sa1
                for k in prop_keys:
                    if k in attrs:
                        props[k] = str(attrs[k])
                dst.write({"type": "Feature", "geometry": geom, "properties": props})

        print(f"GeoJSON exported: {out_path}")
        out_files.append(out_path)

    print("Done. Outputs:\n - " + "\n - ".join(map(str, out_files)))


if __name__ == "__main__":
    main()
