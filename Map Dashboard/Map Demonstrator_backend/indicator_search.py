import json
import re
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

def load_and_parse_js_object(filepath):
    """
    Loads a .js file and extracts the main object, returning it as a Python dictionary.
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as file:
            js_content = file.read()

        # Use regex to find the object literal within the file
        # This looks for content between the first '{' and the last '};'
        match = re.search(r'=\s*(\{.*?\});', js_content, re.DOTALL)
        if not match:
            raise ValueError("Could not find a JavaScript object literal in the file.")
        
        object_str = match.group(1)
        
        # The JS object uses single quotes, which is not valid JSON.
        # We need to be careful with replacements. A simple replace might break strings
        # containing apostrophes. A safer way is to use a more robust parser if the
        # data gets more complex, but for this specific structure, this works.
        
        # Step 1: Replace single quotes used for keys and values with double quotes
        # This regex specifically targets keys and string values
        json_str = re.sub(r"'([^']*)'", r'"\1"', object_str)
        # Step 2: Ensure keys that might not have been quoted are quoted
        json_str = re.sub(r'(\s*?{\s*?|\s*?,\s*?)([^"\s]+?)\s*?:', r'\1"\2":', json_str)


        # Parse the cleaned string as JSON
        data = json.loads(json_str)
        return data

    except FileNotFoundError:
        print(f"Error: The file '{filepath}' was not found.")
        return None
    except Exception as e:
        print(f"An error occurred while parsing the file: {e}")
        return None

def create_documents_from_metadata(metadata):
    """
    Converts the metadata dictionary into a list of searchable documents.
    Each document is a string combining all info for one indicator.
    """
    indicator_names = list(metadata.keys())
    documents = []
    for name in indicator_names:
        # Combine all metadata fields into a single descriptive string
        details = metadata[name]
        doc_string = f"Indicator: {name}. "
        doc_string += ". ".join([f"{key}: {value}" for key, value in details.items()])
        documents.append(doc_string)
    
    return indicator_names, documents

def find_most_relevant_indicator(query, model, indicator_names, document_embeddings):
    """
    Finds the most relevant indicator for a user query using cosine similarity.
    """
    # 1. Encode the user's query into a vector
    query_embedding = model.encode([query])
    
    # 2. Calculate cosine similarity between the query and all indicator documents
    similarities = cosine_similarity(query_embedding, document_embeddings)[0]
    
    # 3. Find the index of the highest similarity score
    most_relevant_index = similarities.argmax()
    
    # 4. Return the name of the most relevant indicator and its score
    return indicator_names[most_relevant_index], similarities[most_relevant_index]


# --- Main Execution ---
if __name__ == "__main__":
    # Specify the path to your JS file
    js_filepath = '/Users/E113938/Library/CloudStorage/OneDrive-RMITUniversity/My Mac Folders/2025/FILTER Project/FILTER/Map Dashboard/Map Demonstrator/src/components/indicatorMetadata.js'
    
    # 1. Load and process the data
    metadata = load_and_parse_js_object(js_filepath)
    
    if metadata:
        indicator_names, documents = create_documents_from_metadata(metadata)
        
        # 2. Load a pre-trained model for creating embeddings
        # 'all-MiniLM-L6-v2' is a great model for semantic search - fast and effective.
        print("Loading sentence transformer model...")
        model = SentenceTransformer('all-MiniLM-L6-v2')
        
        # 3. Create embeddings for all the indicator documents (This is the 'indexing' step)
        print("Creating embeddings for the knowledge base...")
        document_embeddings = model.encode(documents)
        
        # 4. Get user input
        print("-" * 30)
        user_query = input("Enter your objective or query: ")
        
        # 5. Find the best match
        relevant_indicator, score = find_most_relevant_indicator(
            user_query, model, indicator_names, document_embeddings
        )
        
        # 6. Display the result (This is the 'Generation' part of RAG)
        print("\n--- Results ---")
        print(f"✅ Most Relevant Indicator: **{relevant_indicator}**")
        print(f"   Similarity Score: {score:.4f}")
        
        print("\nFull Metadata for the selected indicator:")
        for key, value in metadata[relevant_indicator].items():
            print(f"  - {key}: {value}")
        print("-" * 15)