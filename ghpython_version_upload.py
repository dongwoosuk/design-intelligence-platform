"""
GH Python Script: Upload New Version to Script Store
====================================================
Uploads a new version of an existing script to the Script Store.

INPUTS:
    upload      : bool - Set to True to upload
    script_id   : str - Existing script ID (UUID)
    version     : str - New version string (e.g., "1.1.0")
    changelog   : str - What's new in this version

OUTPUTS:
    result      : str - Upload result message
    version_id  : str - Created version ID
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


def get_script(script_id):
    """Get existing script info"""
    endpoint = f"/rest/v1/scripts?id=eq.{script_id}&select=*"
    result = make_request(endpoint, method="GET")
    if result and len(result) > 0:
        return result[0]
    return None


def upload_to_storage(file_bytes, file_name, script_id, version):
    """Upload file to Supabase Storage"""
    # Determine content type
    if file_name.endswith('.ghx'):
        content_type = "application/xml"
    else:
        content_type = "application/octet-stream"

    # Storage path for versions
    version_safe = version.replace('.', '_')
    storage_path = f"{script_id}/versions/{version_safe}_{file_name}"
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


def create_version_record(script_id, version, changelog, file_url):
    """Create version record in database"""
    data = {
        "script_id": script_id,
        "version": version,
    }

    if changelog:
        data["changelog"] = changelog

    if file_url:
        data["file_url"] = file_url

    return make_request("/rest/v1/script_versions", method="POST", data=data)


def update_script(script_id, version, file_url):
    """Update main script with new version and file URL"""
    endpoint = f"/rest/v1/scripts?id=eq.{script_id}"
    data = {
        "version": version,
        "updated_at": "now()"
    }

    if file_url:
        data["file_url"] = file_url

    return make_request(endpoint, method="PATCH", data=data)


def regenerate_embedding(script_id):
    """Regenerate embedding after version update via dashboard API"""
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
        print(f"Warning: Embedding regeneration failed: {e}")
        return False


def suggest_next_version(current_version):
    """Suggest next patch version"""
    if not current_version:
        return "1.0.1"

    parts = current_version.split('.')
    if len(parts) == 3:
        try:
            patch = int(parts[2]) + 1
            return f"{parts[0]}.{parts[1]}.{patch}"
        except:
            pass
    return f"{current_version}.1"


# ============================================
# Main Upload Function
# ============================================

def upload_version():
    """Main function to upload new version to Script Store"""

    # Validate inputs
    if not script_id:
        return "Error: Script ID is required", None, None

    if not version:
        return "Error: Version is required", None, None

    # Get existing script
    script = get_script(script_id)
    if not script:
        return f"Error: Script not found with ID: {script_id}", None, None

    # Get GH file path
    gh_path = get_gh_file_path()
    if not gh_path:
        return "Error: Please save your GH definition first", None, None

    if not os.path.exists(gh_path):
        return f"Error: File not found: {gh_path}", None, None

    # Check version is newer
    current_version = script.get('version', '0.0.0')

    try:
        # Step 1: Upload GH file to storage
        file_name = os.path.basename(gh_path)
        file_bytes = read_file_bytes(gh_path)
        file_url = upload_to_storage(file_bytes, file_name, script_id, version)

        # Step 2: Create version record
        result = create_version_record(script_id, version, changelog, file_url)

        if isinstance(result, list) and len(result) > 0:
            created_version = result[0]
        else:
            created_version = result

        ver_id = created_version.get('id') if created_version else None

        # Step 3: Update main script
        update_script(script_id, version, file_url)

        # Step 4: Regenerate embedding for AI search (optional)
        embedding_updated = regenerate_embedding(script_id)
        embedding_status = " (AI search updated)" if embedding_updated else ""

        # Success
        dashboard_link = f"{DASHBOARD_URL}/scripts/{script_id}"
        script_name = script.get('name', 'Unknown')
        return f"Success! Version {version} of '{script_name}' uploaded{embedding_status}.\nPrevious: v{current_version} -> New: v{version}", ver_id, dashboard_link

    except Exception as e:
        return f"Error: {str(e)}", None, None


# ============================================
# Execute
# ============================================

if upload:
    result, version_id, script_url = upload_version()
else:
    # Show current script info if script_id is provided
    if script_id:
        try:
            script = get_script(script_id)
            if script:
                current = script.get('version', '0.0.0')
                suggested = suggest_next_version(current)
                result = f"Script: {script.get('name', 'Unknown')}\nCurrent version: v{current}\nSuggested next: v{suggested}\n\nSet 'upload' to True to upload new version"
            else:
                result = f"Script not found with ID: {script_id}"
        except Exception as e:
            result = f"Error fetching script: {str(e)}"
    else:
        result = "Enter script_id and set 'upload' to True to upload a new version"
    version_id = None
    script_url = None
