# Backend API (FastAPI)

This adds a minimal FastAPI service that accepts a CSV upload for a selected indicator and returns a generated GeoJSON.

## Endpoints
- POST /generate
  - form fields: indicator (education|employment|income|pob|occupation), file (CSV)
  - returns: GeoJSON FeatureCollection
- GET /health

## Requirements
```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
yarn install 
```

## Run
```
uvicorn api:app --reload --port 8000
```

The frontend (Create React App) is set up with a development proxy to http://localhost:8000 so `fetch('/generate')` works during `yarn react-scripts start`.

## Notes
- The shapefile must exist under `Data for indicators/SA1_2021_AUST_GDA2020.shp` (same directory as the CSVs). Set FILTER_DATA_DIR env var to point elsewhere if needed.
- The generator uses a default subset of SA1s if none are provided; adjust function or add parameters if you want full-state output.
