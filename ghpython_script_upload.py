"""
GH Python Script: Upload to Script Store
========================================
Uploads the current GH definition to the Script Store.

INPUTS:
    upload      : bool - Set to True to upload
    name        : str - Script name
    category    : str - Category (massing, unit_study, facade, analysis, optimization, documentation, other)
    version     : str - Version string (e.g., "1.0.0")
    author      : str - Author name
    description : str - Description text
    dependencies: str - Comma-separated plugin names (e.g., "Human, Ladybug")
    tags        : str - Comma-separated tags (e.g., "residential, tower")

OUTPUTS:
    result      : str - Upload result message
    script_id   : str - Created script ID
    script_url  : str - Dashboard URL for the script
"""

import os
import sys
import json
import urllib.request
import urllib.error
import Grasshopper

# ============================================
# CONFIGURATION - config.py에서 불러오기
# ============================================
try:
    from config import SUPABASE_URL, SUPABASE_KEY
except ImportError:
    print("WARNING: config.py not found. Please copy config.example.py to config.py")
    SUPABASE_URL = ""
    SUPABASE_KEY = ""
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "http://localhost:3000")

# ============================================
# Helper Functions
# ============================================

def make_request(endpoint, method="GET", data=None, content_type="application/json"):
    """Make HTTP request to Supabase"""
    url = f"{SUPABASE_URL}{endpoint}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": content_type,
    }

    if content_type == "application/json" and data:
        headers["Prefer"] = "return=representation"

    req_data = None
    if data:
        if isinstance(data, bytes):
            req_data = data
        else:
            req_data = json.dumps(data).encode('utf-8')

    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        raise Exception(f"HTTP {e.code}: {error_body}")


def get_gh_file_path():
    """Get the current GH definition file path"""
    doc = Grasshopper.Instances.ActiveCanvas.Document
    if doc and doc.FilePath:
        return doc.FilePath
    return None


def read_file_bytes(file_path):
    """Read file as bytes"""
    with open(file_path, 'rb') as f:
        return f.read()


def upload_to_storage(file_bytes, file_name, script_id):
    """Upload file to Supabase Storage"""
    # Determine content type
    if file_name.endswith('.ghx'):
        content_type = "application/xml"
    else:
        content_type = "application/octet-stream"

    # Storage path
    storage_path = f"{script_id}/{file_name}"
    endpoint = f"/storage/v1/object/scripts/{storage_path}"

    url = f"{SUPABASE_URL}{endpoint}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": content_type,
    }

    req = urllib.request.Request(url, data=file_bytes, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            # Return public URL
            return f"{SUPABASE_URL}/storage/v1/object/public/scripts/{storage_path}"
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        raise Exception(f"Storage upload failed: {error_body}")


def create_script_record(script_data):
    """Create script record in database"""
    return make_request("/rest/v1/scripts", method="POST", data=script_data)


def update_script_file_url(script_id, file_url):
    """Update script with file URL"""
    endpoint = f"/rest/v1/scripts?id=eq.{script_id}"
    return make_request(endpoint, method="PATCH", data={"file_url": file_url})


def generate_embedding(script_id):
    """Trigger embedding generation via dashboard API"""
    url = f"{DASHBOARD_URL}/api/embeddings"
    headers = {
        "Content-Type": "application/json",
    }
    data = json.dumps({
        "action": "generate",
        "scriptId": script_id
    }).encode('utf-8')

    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result.get('success', False)
    except Exception as e:
        # Embedding generation is optional, don't fail the upload
        print(f"Warning: Embedding generation failed: {e}")
        return False


# ============================================
# Main Upload Function
# ============================================

def upload_script():
    """Main function to upload script to Script Store"""

    # Validate inputs
    if not name:
        return "Error: Script name is required", None, None

    if not category:
        return "Error: Category is required", None, None

    valid_categories = ['massing', 'unit_study', 'facade', 'analysis', 'optimization', 'documentation', 'other']
    if category.lower() not in valid_categories:
        return f"Error: Invalid category. Use one of: {', '.join(valid_categories)}", None, None

    # Get GH file path
    gh_path = get_gh_file_path()
    if not gh_path:
        return "Error: Please save your GH definition first", None, None

    if not os.path.exists(gh_path):
        return f"Error: File not found: {gh_path}", None, None

    # Prepare script data
    script_data = {
        "name": name,
        "category": category.lower(),
        "version": version if version else "1.0.0",
    }

    if author:
        script_data["author"] = author

    if description:
        script_data["description"] = description

    if dependencies:
        deps = [d.strip() for d in dependencies.split(',') if d.strip()]
        script_data["dependencies"] = deps

    if tags:
        tag_list = [t.strip() for t in tags.split(',') if t.strip()]
        script_data["tags"] = tag_list

    try:
        # Step 1: Create script record
        result = create_script_record(script_data)

        if isinstance(result, list) and len(result) > 0:
            created_script = result[0]
        else:
            created_script = result

        script_id = created_script.get('id')

        if not script_id:
            return "Error: Failed to create script record", None, None

        # Step 2: Upload GH file
        file_name = os.path.basename(gh_path)
        file_bytes = read_file_bytes(gh_path)
        file_url = upload_to_storage(file_bytes, file_name, script_id)

        # Step 3: Update script with file URL
        update_script_file_url(script_id, file_url)

        # Step 4: Generate embedding for AI search (optional)
        embedding_generated = generate_embedding(script_id)
        embedding_status = " (AI search enabled)" if embedding_generated else ""

        # Success
        dashboard_link = f"{DASHBOARD_URL}/scripts/{script_id}"
        return f"Success! Script '{name}' uploaded{embedding_status}.", script_id, dashboard_link

    except Exception as e:
        return f"Error: {str(e)}", None, None


# ============================================
# Execute
# ============================================

if upload:
    result, script_id, script_url = upload_script()
else:
    result = "Set 'upload' to True to upload the current GH definition"
    script_id = None
    script_url = None
