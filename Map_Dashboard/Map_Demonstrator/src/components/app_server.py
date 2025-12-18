import errno
import json
import os
import re
import time
from threading import Lock

from flask import Flask, request, jsonify
from flask_cors import CORS
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely.prepared import prep
from pyproj import Transformer, CRS
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Initialize Flask App and CORS ---
app = Flask(__name__)
CORS(app) # This enables cross-origin requests

def load_metadata_from_json(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as file:
            data = json.load(file)
            return data
    except Exception as e:
        print(f"An error occurred while parsing the JSON file: {e}")
        return None


# JSON_FILEPATH = './indicatorMetadata.json'
JSON_FILEPATH = os.path.join(BASE_DIR, 'indicatorMetadata.json')

METADATA = load_metadata_from_json(JSON_FILEPATH)

def create_documents_from_metadata(metadata):
    indicator_names = list(metadata.keys())
    documents = []
    for name in indicator_names:
        details = metadata[name]
        doc_string = f"Indicator: {name}. "
        doc_string += ". ".join([f"{key}: {value}" for key, value in details.items()])
        documents.append(doc_string)
    return indicator_names, documents

# --- MODIFIED function to return a ranked list ---
def find_ranked_indicators(query, model, indicator_names, document_embeddings):
    """
    Finds and ranks all indicators based on relevance to a user query.
    """
    query_embedding = model.encode([query])
    similarities = cosine_similarity(query_embedding, document_embeddings)[0]

    # Combine indicators with their scores
    results = []
    for i, name in enumerate(indicator_names):
        results.append({"indicator": name, "score": float(similarities[i])})

    # --- Manual boosting rules (post-processing) ---
    # Ensure "Housing stress" surfaces at top when user intent clearly matches.
    qlow = query.lower()
    if ('housing' in qlow and 'stress' in qlow):
        # Find current max score to exceed it slightly.
        current_max = max(r["score"] for r in results) if results else 0.0
        for r in results:
            if r["indicator"].lower() == 'housing stress':
                # Boost above current max while preserving relative ordering for other indicators.
                r["score"] = current_max + 0.000001
                break
    # Additional mild boost if query contains only 'housing' to still promote relevance.
    elif 'housing' in qlow:
        for r in results:
            if r["indicator"].lower() == 'housing stress':
                r["score"] *= 1.05  # modest multiplier
                break

    # Sort by score in descending order
    ranked_results = sorted(results, key=lambda x: x['score'], reverse=True)
    return ranked_results

# --- Pre-load model and data ONCE on server startup for efficiency ---
print("Backend server is starting...")
# JSON_FILEPATH = '/Users/E113938/Library/CloudStorage/OneDrive-RMITUniversity/My Mac Folders/2025/FILTER Project/FILTER/Map Dashboard/Map Demonstrator/src/components/indicatorMetadata.json' # Adjust this path if needed
METADATA = load_metadata_from_json(JSON_FILEPATH)

# Globals for search backends
MODEL = None
DOCUMENT_EMBEDDINGS = None
TFIDF_VECTORIZER = None
DOC_TFIDF = None
SENT_TRANS_AVAILABLE = False

if METADATA:
    INDICATOR_NAMES, DOCUMENTS = create_documents_from_metadata(METADATA)
    # Try to import and initialize sentence_transformers; if it fails, fall back to TF-IDF.
    try:
        from sentence_transformers import SentenceTransformer  # noqa: F401
        SENT_TRANS_AVAILABLE = True
    except Exception as e:
        print("⚠️ sentence_transformers unavailable; falling back to TF-IDF search:", e)
        SENT_TRANS_AVAILABLE = False

    if SENT_TRANS_AVAILABLE:
        try:
            print("Loading sentence transformer model (this may take a moment)...")
            MODEL = SentenceTransformer('all-MiniLM-L6-v2')
            print("Creating embeddings for the knowledge base...")
            DOCUMENT_EMBEDDINGS = MODEL.encode(DOCUMENTS)
            print("✅ Backend ready with embeddings.")
        except Exception as e:
            print("⚠️ Failed to initialize embeddings backend; using TF-IDF instead:", e)
            MODEL = None
            DOCUMENT_EMBEDDINGS = None
            TFIDF_VECTORIZER = TfidfVectorizer(stop_words='english')
            DOC_TFIDF = TFIDF_VECTORIZER.fit_transform(DOCUMENTS)
            print("✅ Backend ready with TF-IDF.")
    else:
        TFIDF_VECTORIZER = TfidfVectorizer(stop_words='english')
        DOC_TFIDF = TFIDF_VECTORIZER.fit_transform(DOCUMENTS)
        print("✅ Backend ready with TF-IDF.")
else:
    print("❌ ERROR: Could not load metadata. Backend cannot process requests.")
    INDICATOR_NAMES, DOCUMENTS = [], []


# --- API Endpoint Definition ---
@app.route('/api/search', methods=['POST'])
def search_indicators():
    if not INDICATOR_NAMES:
        return jsonify({"error": "Server is not ready, metadata could not be loaded."}), 500

    data = request.get_json()
    if not data or 'query' not in data:
        return jsonify({"error": "Missing 'query' in request body"}), 400

    user_query = data['query']

    # Get the ranked list of indicators via embeddings if available; otherwise TF-IDF
    if MODEL is not None and DOCUMENT_EMBEDDINGS is not None:
        ranked_indicators = find_ranked_indicators(user_query, MODEL, INDICATOR_NAMES, DOCUMENT_EMBEDDINGS)
    else:
        # TF-IDF fallback
        q_vec = TFIDF_VECTORIZER.transform([user_query])
        sims = cosine_similarity(q_vec, DOC_TFIDF)[0]
        results = [{"indicator": name, "score": float(sims[i])} for i, name in enumerate(INDICATOR_NAMES)]
        ranked_indicators = sorted(results, key=lambda x: x['score'], reverse=True)

    return jsonify(ranked_indicators)

# --- Main Execution ---
# NOTE: app.run moved to end of file so all routes are registered first.

# ========================= NEW: SPATIAL OVERLAY API ========================= #

# Project root: two levels up from src/components
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA_DIR = os.path.join(BASE_DIR, 'public', 'data')

# Simple in‑memory cache so we don't keep hitting the filesystem for large GeoJSONs.
_GEOJSON_CACHE = {}
_GEOJSON_CACHE_LOCK = Lock()
_GEOJSON_MAX_IO_RETRIES = 5
_ALT_DATA_DIR = os.path.join(BASE_DIR, 'build', 'data')


def _load_from_single_path(abs_path: str):
    """Load a GeoJSON from a specific absolute path with retry + caching."""
    mtime = os.path.getmtime(abs_path)

    with _GEOJSON_CACHE_LOCK:
        cached = _GEOJSON_CACHE.get(abs_path)
        if cached and cached['mtime'] == mtime:
            return cached['data']

    last_err = None
    backoff = 0.3
    for attempt in range(1, _GEOJSON_MAX_IO_RETRIES + 1):
        try:
            with open(abs_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            with _GEOJSON_CACHE_LOCK:
                _GEOJSON_CACHE[abs_path] = {'mtime': mtime, 'data': data}
            return data
        except (TimeoutError, OSError) as err:
            # macOS / network FS may surface ETIMEDOUT as either
            if isinstance(err, OSError) and err.errno not in (errno.ETIMEDOUT,):
                last_err = err
                break
            last_err = err
            if attempt == _GEOJSON_MAX_IO_RETRIES:
                break
            # brief exponential backoff
            time.sleep(backoff)
            backoff = min(backoff * 1.7, 2.5)
        except Exception as err:
            last_err = err
            break

    if cached:
        print(f"[Overlay] Warning: using cached copy of {os.path.basename(abs_path)} after IO error: {last_err}")
        return cached['data']

    raise last_err


def load_geojson(path: str):
    """
    Load a GeoJSON file with retry semantics and fallback to build/data copies.

    Many of our large datasets live inside a OneDrive-synced directory, which
    can occasionally return errno.ETIMEDOUT when read directly. To keep the API
    responsive we:
      1. Try the requested path (with caching + retry)
      2. If it fails and the file lives under public/data, also try the same
         relative path under build/data (which is typically part of the repo and
         not streamed).
    """
    abs_path = os.path.abspath(path)
    candidates = [abs_path]
    try:
        rel = os.path.relpath(abs_path, DATA_DIR)
        if not rel.startswith('..'):
            alt_path = os.path.join(_ALT_DATA_DIR, rel)
            if os.path.exists(alt_path):
                candidates.append(os.path.abspath(alt_path))
    except ValueError:
        # Path not relative to DATA_DIR; ignore
        pass

    last_err = None
    for candidate in candidates:
        try:
            return _load_from_single_path(candidate)
        except Exception as err:
            last_err = err
            continue

    raise last_err

def guess_epsg_from_geojson(fc):
    """
    Best-effort EPSG extraction from a GeoJSON's crs.name value.
    Falls back to 4326 (WGS84/CRS84) if missing/unknown.
    Handles patterns like:
      - urn:ogc:def:crs:EPSG::4283
      - EPSG:7844
      - urn:ogc:def:crs:OGC:1.3:CRS84
    """
    name = str((fc.get('crs', {}).get('properties', {}) or {}).get('name', ''))
    upper = name.upper()
    # Direct EPSG numeric detection
    m = re.search(r"EPSG(?:::|:)[^0-9]*(\d+)", name, re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            pass
    # Common aliases
    if 'CRS84' in upper:
        return 4326
    if 'EPSG::4283' in upper or 'EPSG:4283' in upper or 'GDA94' in upper:
        return 4283
    if 'EPSG::7844' in upper or 'EPSG:7844' in upper or 'GDA2020' in upper:
        return 7844
    # Default to WGS84
    return 4326

def transform_coords(coords, transformer):
    # Recursively apply transform to nested ring lists
    if not isinstance(coords, list):
        return coords
    if len(coords) == 0:
        return coords
    if isinstance(coords[0], (int, float)) and len(coords) == 2:
        x, y = coords  # x=lon, y=lat
        X, Y = transformer.transform(x, y)  # always_xy=True => expects lon,lat
        return [X, Y]
    return [transform_coords(c, transformer) for c in coords]

def reproject_feature_geometry(feat_geom, src_epsg, dst_epsg=3857):
    # Ensure axis order lon,lat by setting always_xy=True
    transformer = Transformer.from_crs(CRS.from_epsg(src_epsg), CRS.from_epsg(dst_epsg), always_xy=True)
    gtype = feat_geom.get('type')
    if gtype == 'Polygon':
        new_coords = transform_coords(feat_geom['coordinates'], transformer)
        return { 'type': 'Polygon', 'coordinates': new_coords }
    if gtype == 'MultiPolygon':
        new_coords = transform_coords(feat_geom['coordinates'], transformer)
        return { 'type': 'MultiPolygon', 'coordinates': new_coords }
    return feat_geom

@app.route('/api/precinct_overlay', methods=['POST'])
def precinct_overlay():
    try:
        data = request.get_json(force=True)
        precinct_name = data.get('precinctName')
        year = int(data.get('year', 2011))
        indicator = (data.get('indicator') or '').strip()
        if not precinct_name:
            return jsonify({'error': 'Missing precinctName'}), 400

        # Normalize indicator (default to jobs for backward compatibility)
        ind_key = 'jobs'
        ind_label = 'Number of jobs'
        if indicator:
            low = indicator.lower()
            if ('spec' in low) or ('industry' in low):
                ind_key = 'spec'
                ind_label = 'Industry specialisation'
            elif (('social' in low and 'infra' in low) or ('accessibility' in low and 'social' in low)):
                ind_key = 'socinfra'
                ind_label = 'Accessibility of Social Infrastructure'
            elif ('housing' in low and 'stress' in low) or ('housing' in low and 'percent' in low):
                # Support various query phrasings including metadata full label containing parentheses
                ind_key = 'housing_stress'
                ind_label = 'Housing stress'
            elif ('land' in low and 'mix' in low) or ('lum' in low):
                ind_key = 'lum'
                ind_label = 'Land use mix'
            elif ('age' in low) and (('diversity' in low) or ('resident' in low)):
                ind_key = 'age_mix'
                ind_label = 'Diversity of residents’ age'
            elif ('income' in low) and (('diversity' in low) or ('resident' in low)):
                ind_key = 'income_mix'
                ind_label = 'Diversity of residents’ income'
            elif ('walk' in low):
                # Walkability index (2018 & 2021) at SA1 scale
                ind_key = 'walkability'
                ind_label = 'Walkability'
            elif ('resident' in low and 'sa1' in low):
                ind_key = 'residents_sa1'
                ind_label = 'number of residents_SA1'
            elif ('dwell' in low):
                ind_key = 'dwellings'
                ind_label = 'Number of dwellings'
            elif ('resident' in low) or ('mesh' in low) or ('resdwel' in low):
                # Support legacy combined label and explicit residents
                ind_key = 'residents'
                ind_label = 'Number of residents'
            else:
                ind_key = 'jobs'
                ind_label = 'Number of jobs'

        # Select dataset and properties based on indicator
        if ind_key == 'spec':
            data_file = {
                2011: 'Inudstry_Specialisation_DZN_11.geojson',
                2016: 'Inudstry_Specialisation_DZN_16.geojson',
                2021: 'Inudstry_Specialisation_DZN_21.geojson'
            }.get(year)
            val_prop = {2011: 'Special_11', 2016: 'Special_16', 2021: 'Special_21'}.get(year)
        elif ind_key == 'socinfra':
            # Social Infrastructure Index at SA1 scale (2018 & 2021)
            # Coerce unsupported years to 2018 as default
            if year not in (2018, 2021):
                year = 2018
            data_file = 'Social_Infrastructure_Index_SA1_18_21.geojson'
            val_prop = {2018: 'SoInfra_18', 2021: 'SoInfra_21'}.get(year)
        elif ind_key == 'housing_stress':
            # Housing stress percentage (2018 & 2021) at SA1 scale
            if year not in (2018, 2021):
                year = 2018
            data_file = 'Housing_Stress_SA1_18_21.geojson'
            val_prop = {2018: 'HouStre_18', 2021: 'HouStre_21'}.get(year)
        elif ind_key == 'lum':
            # Single SA1 file with all years' values
            data_file = 'Land_Use_Mix__SA1_11_16_21.geojson'
            val_prop = {2011: 'LUM_11', 2016: 'LUM_16', 2021: 'LUM_21'}.get(year)
        elif ind_key in ('residents', 'dwellings', 'resdwel', 'residents_sa1'):
            if ind_key == 'residents_sa1':
                data_file = 'Number_of_Residents_and_Dwellings_SA1_11_16_21.geojson'
                val_prop = {2011: 'Person_11', 2016: 'Person_16', 2021: 'Person_21'}.get(year)
            else:
                data_file = {
                    2011: 'Number_of_Residents_and_Dwellings_MB_11.geojson',
                    2016: 'Number_of_Residents_and_Dwellings_MB_16.geojson',
                    2021: 'Number_of_Residents_and_Dwellings_MB_21.geojson'
                }.get(year)
                # Overlay value: choose residents or dwellings depending on indicator
                if ind_key == 'dwellings':
                    val_prop = {2011: 'Dwell_11', 2016: 'Dwell_16', 2021: 'Dwell_21'}.get(year)
                else:
                    # default to residents (supports legacy 'resdwel')
                    val_prop = {2011: 'Person_11', 2016: 'Person_16', 2021: 'Person_21'}.get(year)
        elif ind_key == 'age_mix':
            data_file = 'Age_Mix__SA1_16_21.geojson'
            val_prop = {2016: 'Age_Mix_16', 2021: 'Age_Mix_21'}.get(year)
        elif ind_key == 'income_mix':
            data_file = 'Income_Mix_SA1_16_21.geojson'
            val_prop = {2016: 'Inc_Mix_16', 2021: 'Inc_Mix_21'}.get(year)
        elif ind_key == 'walkability':
            # Walkability index (2018 & 2021) at SA1 scale
            if year not in (2018, 2021):
                year = 2018
            data_file = 'Walkability_SA1_16_21.geojson'
            val_prop = {2018: 'Walkabi_18', 2021: 'Walkabi_21'}.get(year)
        else:
            data_file = {
                2011: 'Number_of_Jobs_DZN_11.geojson',
                2016: 'Number_of_Jobs_DZN_16.geojson',
                2021: 'Number_of_Jobs_DZN_21.geojson'
            }.get(year)
            val_prop = {2011: 'TotJob_11', 2016: 'TotJob_16', 2021: 'TotJob_21'}.get(year)

        if not data_file:
            return jsonify({'error': f'Unsupported year {year}'}), 400

        precincts_path = os.path.join(DATA_DIR, 'fb-precincts-official-boundary.geojson')
        data_path = os.path.join(DATA_DIR, data_file)
        print(f"[Overlay] Request precinct='{precinct_name}', year={year}, indicator='{ind_label}'")
        print(f"[Overlay] DATA_DIR={DATA_DIR}")
        print(f"[Overlay] precincts_path={precincts_path}")
        print(f"[Overlay] data_path={data_path}")

        precincts_fc = load_geojson(precincts_path)
        data_fc = load_geojson(data_path)

        # EPSG detection
        precinct_epsg = guess_epsg_from_geojson(precincts_fc)
        data_epsg = guess_epsg_from_geojson(data_fc)
        print(f"[Overlay] EPSG precinct={precinct_epsg}, data={data_epsg}")

        # Find the requested precinct feature(s)
        p_feats = [f for f in precincts_fc.get('features', []) if (f.get('properties', {}).get('name') == precinct_name)]
        print(f"[Overlay] Found {len(p_feats)} matching precinct feature(s)")
        if not p_feats:
            return jsonify({'error': f'Precinct {precinct_name} not found'}), 404

        # Reproject precinct to 3857 and union into single geometry
        p_geoms = []
        for f in p_feats:
            g = reproject_feature_geometry(f['geometry'], precinct_epsg, 3857)
            try:
                shp = shape(g)
                if not shp.is_empty and shp.area > 0:
                    p_geoms.append(shp)
            except Exception:
                continue
        if not p_geoms:
            return jsonify({'error': 'Precinct geometry invalid after reprojection'}), 500

        p_union = unary_union(p_geoms)
        p_prep = prep(p_union)
        p_area = float(p_union.area)
        print(f"[Overlay] Precinct area (m^2) = {p_area:.2f}")

        # Prepare outputs and spatial unit
        if ind_key == 'lum':
            code_prop = 'SA1_CODE_2'
            spatial_unit = 'SA1'
        elif ind_key == 'socinfra':
            code_prop = 'SA1_CODE_2'
            spatial_unit = 'SA1'
        elif ind_key == 'housing_stress':
            code_prop = 'SA1_CODE_2'
            spatial_unit = 'SA1'
        elif ind_key in ('residents', 'dwellings', 'resdwel'):
            code_prop = {2011: 'MB_CODE11', 2016: 'MB_CODE16', 2021: 'MB_CODE21'}[year]
            spatial_unit = 'MB'
        elif ind_key == 'age_mix':
            code_prop = 'SA1_CODE_2'
            spatial_unit = 'SA1'
        elif ind_key == 'income_mix':
            code_prop = 'SA1_CODE_2'
            spatial_unit = 'SA1'
        elif ind_key == 'walkability':
            code_prop = 'SA1_CODE_2'
            spatial_unit = 'SA1'
        elif ind_key == 'residents_sa1':
            code_prop = 'SA1_CODE_2'
            spatial_unit = 'SA1'
        else:
            code_prop = {2011: 'DZN_CODE11', 2016: 'DZN_CODE16', 2021: 'DZN_CODE21'}[year]
            spatial_unit = 'DZN'
        intersections = []

    # Iterate features (DZN for jobs/spec, SA1 for LUM, MB for residents/dwellings)
        feats = data_fc.get('features', [])
        print(f"[Overlay] Features count = {len(feats)}")
        for f in feats:
            g = f.get('geometry')
            if not g:
                continue
            try:
                g_reproj = reproject_feature_geometry(g, data_epsg, 3857)
                shp = shape(g_reproj)
                if shp.is_empty or shp.area <= 0:
                    continue
                if not p_prep.intersects(shp):
                    continue
                inter = p_union.intersection(shp)
                if inter.is_empty:
                    continue
                a = float(inter.area)
                if a <= 0:
                    continue
                code = f.get('properties', {}).get(code_prop, '')
                val = f.get('properties', {}).get(val_prop, 0)
                try:
                    val = float(val)
                except Exception:
                    val = 0.0
                # Feature area (for MB weighting and diagnostics)
                feat_area = float(shp.area)
                area_pct_precinct = a / p_area if p_area > 0 else 0.0
                area_pct_feature = a / feat_area if feat_area > 0 else 0.0
                intersections.append({
                    'code': code,
                    'value': val,
                    'area': a,
                    # Backward-compat: areaPct remains relative to precinct area
                    'areaPct': area_pct_precinct,
                    # New fields:
                    'featureArea': feat_area,
                    'areaPctPrecinct': area_pct_precinct,
                    'areaPctFeature': area_pct_feature
                })
            except Exception:
                continue

        intersections.sort(key=lambda i: i['areaPct'], reverse=True)
        result = {
            'precinct': precinct_name,
            'year': year,
            'precinctArea': p_area,
            # Spatial unit info for client-side narratives
            'spatialUnit': spatial_unit,
            'intersectCount': len(intersections),
            # Backward-compat field name used previously
            'dznIntersectCount': len(intersections),
            'intersections': intersections
        }
        print(f"[Overlay] Intersections found = {len(intersections)}")
        return jsonify(result)
    except Exception as e:
        import traceback
        print('[Overlay] ERROR:', str(e))
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
        

if __name__ == "__main__":
    # You may need to install json5: pip install json5
    app.run(debug=True, port=5000)