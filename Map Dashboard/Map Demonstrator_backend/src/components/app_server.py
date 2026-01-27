import json
import re
from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

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
if __name__ == "__main__":
    # You may need to install json5: pip install json5
    app.run(debug=True, port=5000)