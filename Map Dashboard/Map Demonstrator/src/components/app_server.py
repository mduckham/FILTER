import json
import re
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely.prepared import prep
from pyproj import Transformer, CRS

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


JSON_FILEPATH = './indicatorMetadata.json'
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

    # Sort by score in descending order
    ranked_results = sorted(results, key=lambda x: x['score'], reverse=True)
    return ranked_results

# --- Pre-load model and data ONCE on server startup for efficiency ---
print("Backend server is starting...")
JSON_FILEPATH = '/Users/E113938/Library/CloudStorage/OneDrive-RMITUniversity/My Mac Folders/2025/FILTER Project/FILTER/Map Dashboard/Map Demonstrator/src/components/indicatorMetadata.json' # Adjust this path if needed
METADATA = load_metadata_from_json(JSON_FILEPATH)

if METADATA:
    INDICATOR_NAMES, DOCUMENTS = create_documents_from_metadata(METADATA)
    print("Loading sentence transformer model (this may take a moment)...")
    MODEL = SentenceTransformer('all-MiniLM-L6-v2')
    print("Creating embeddings for the knowledge base...")
    DOCUMENT_EMBEDDINGS = MODEL.encode(DOCUMENTS)
    print("✅ Backend ready.")
else:
    print("❌ ERROR: Could not load metadata. Backend cannot process requests.")
    MODEL, INDICATOR_NAMES, DOCUMENT_EMBEDDINGS = None, [], []


# --- API Endpoint Definition ---
@app.route('/api/search', methods=['POST'])
def search_indicators():
    if not MODEL:
        return jsonify({"error": "Server is not ready, metadata could not be loaded."}), 500

    data = request.get_json()
    if not data or 'query' not in data:
        return jsonify({"error": "Missing 'query' in request body"}), 400

    user_query = data['query']

    # Get the ranked list of indicators
    ranked_indicators = find_ranked_indicators(user_query, MODEL, INDICATOR_NAMES, DOCUMENT_EMBEDDINGS)

    return jsonify(ranked_indicators)

# --- Main Execution ---
# NOTE: app.run moved to end of file so all routes are registered first.

# ========================= NEW: SPATIAL OVERLAY API ========================= #

# Project root: two levels up from src/components
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA_DIR = os.path.join(BASE_DIR, 'public', 'data')

def load_geojson(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

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
        if not precinct_name:
            return jsonify({'error': 'Missing precinctName'}), 400

        jobs_file = {
            2011: 'Number_of_Jobs_DZN_11.geojson',
            2016: 'Number_of_Jobs_DZN_16.geojson',
            2021: 'Number_of_Jobs_DZN_21.geojson'
        }.get(year)
        if not jobs_file:
            return jsonify({'error': f'Unsupported year {year}'}), 400

        precincts_path = os.path.join(DATA_DIR, 'fb-precincts-official-boundary.geojson')
        jobs_path = os.path.join(DATA_DIR, jobs_file)
        print(f"[Overlay] Request precinct='{precinct_name}', year={year}")
        print(f"[Overlay] DATA_DIR={DATA_DIR}")
        print(f"[Overlay] precincts_path={precincts_path}")
        print(f"[Overlay] jobs_path={jobs_path}")

        precincts_fc = load_geojson(precincts_path)
        jobs_fc = load_geojson(jobs_path)

        # EPSG detection
        precinct_epsg = guess_epsg_from_geojson(precincts_fc)
        jobs_epsg = guess_epsg_from_geojson(jobs_fc)
        print(f"[Overlay] EPSG precinct={precinct_epsg}, jobs={jobs_epsg}")

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

        # Prepare outputs
        code_prop = {2011: 'DZN_CODE11', 2016: 'DZN_CODE16', 2021: 'DZN_CODE21'}[year]
        val_prop = {2011: 'TotJob_11', 2016: 'TotJob_16', 2021: 'TotJob_21'}[year]
        intersections = []

        # Iterate DZN features
        feats = jobs_fc.get('features', [])
        print(f"[Overlay] DZN feature count = {len(feats)}")
        for f in feats:
            g = f.get('geometry')
            if not g:
                continue
            try:
                g_reproj = reproject_feature_geometry(g, jobs_epsg, 3857)
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
                intersections.append({
                    'code': code,
                    'value': val,
                    'area': a,
                    'areaPct': a / p_area if p_area > 0 else 0.0
                })
            except Exception:
                continue

        intersections.sort(key=lambda i: i['areaPct'], reverse=True)
        result = {
            'precinct': precinct_name,
            'year': year,
            'precinctArea': p_area,
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