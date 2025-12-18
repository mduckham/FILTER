

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


DATASETS = {
    "education": "Education-VIC.csv",
    "employment": "employment-VIC.csv",
    "income": "Income-VIC1.csv",
    "pob": "POB-VIC1.csv",
    "occupation": "Occupation-VIC.csv",
}


def resolve_paths(data_dir: Path):
    base = Path(data_dir).expanduser()
    shp_path = (base / "SA1_2021_AUST_GDA2020.shp").expanduser()
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
    # Default set used previously (Fishermans Bend subset)
    return {"20605151101", "20605151102", "20605151103", "20605151104", "20605151105"}


def detect_sa1_field(row: dict) -> str | None:
    candidates = [
        "SA1 (UR)",
        "SA1_CODE21",
        "SA1_CODE_2021",
        "SA1_CODE",
        "SA1_2021",
    ]
    for k in candidates:
        if k in row and str(row[k]).strip():
            return k
    return None


def load_target_features(shp_path: Path, target_ids: set[str]):
    """Read shapefile once and cache geometry for target SA1s only."""
    cached = {}
    with fiona.open(str(shp_path)) as src:
        crs = src.crs
        for feat in src:
            sa1_val = norm_sa1(feat["properties"].get("SA1_CODE21", ""))
            if sa1_val in target_ids:
                cached[sa1_val] = feat["geometry"]
    return crs, cached


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
        help="Dataset to process: one of {education,employment,income,pob,occupation} or 'all'",
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

    base, shp_path = resolve_paths(Path(args.data_dir))

    # Determine datasets to run
    if args.dataset.lower() == "all":
        to_run = list(DATASETS.keys())
    else:
        to_run = [d.strip().lower() for d in args.dataset.split(",") if d.strip()]
        invalid = [d for d in to_run if d not in DATASETS]
        if invalid:
            valid = ", ".join(DATASETS.keys())
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

    # Cache target geometries once
    crs, target_geoms = load_target_features(shp_path, target_ids)
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
        sa1_field = detect_sa1_field(rows[0])
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
