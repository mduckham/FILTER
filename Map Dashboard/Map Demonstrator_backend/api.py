from __future__ import annotations

import json
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Dynamic import of indicator-generator.py (filename has a hyphen)
import importlib.util
import sys

_GEN_PATH = Path(__file__).parent / "indicator-generator.py"
spec = importlib.util.spec_from_file_location("indicator_generator", _GEN_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Failed to load indicator generator module from {_GEN_PATH}")
indicator_generator = importlib.util.module_from_spec(spec)
sys.modules["indicator_generator"] = indicator_generator
spec.loader.exec_module(indicator_generator)
from indicator_generator import generate_geojson_from_csv  # type: ignore


app = FastAPI(title="FILTER Indicator Generator API")

# Allow local dev from CRA (http://localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/generate")
async def generate(
    indicator: str = Form(..., description="One of: education, employment, income, pob, occupation"),
    file: UploadFile = File(..., description="CSV file containing SA1 data for the selected indicator"),
):
    indicator = indicator.strip().lower()
    if indicator not in {"education", "employment", "income", "pob", "occupation"}:
        raise HTTPException(status_code=400, detail=f"Invalid indicator: {indicator}")

    # Save uploaded CSV to a temp file
    try:
        suffix = ".csv" if file.filename and file.filename.lower().endswith(".csv") else ""
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = Path(tmp.name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to store uploaded file: {exc}")

    try:
        # Use default data directory (relative to this repo) for shapefile
        out_path = generate_geojson_from_csv(
            dataset=indicator,
            csv_path=tmp_path,
            data_dir=None,
            target_ids=None,
            out_dir=tempfile.gettempdir(),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}")
    finally:
        try:
            tmp_path.unlink(missing_ok=True)  # cleanup uploaded temp
        except Exception:
            pass

    try:
        with open(out_path, "r", encoding="utf-8") as f:
            geojson_obj = json.load(f)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read output GeoJSON: {exc}")

    return JSONResponse(content=geojson_obj, media_type="application/geo+json")


@app.get("/health")
def health():
    return {"status": "ok"}
