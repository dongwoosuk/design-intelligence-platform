"""
Script Store Browser
Browse and load scripts from Script Store

@input: category, script_id, load
@output: scripts, script_ids, versions, load_result

Inputs:
- category (str): Filter by category (Value List "category")
- script_id (str): Script to view/load (Value List "Scripts")
- load (bool): Load the selected script into canvas (Button)

Outputs:
- scripts (str): List of scripts or script details
- script_ids (list): List of script IDs for reference
- versions (str): Version history (if script_id provided)
- load_result (str): Result of load operation

Value List Auto-Population (by NickName):
- "category" → massing, unit_study, facade, analysis, optimization, documentation, other
- "Scripts" → Script names with IDs (populated after category selection)

Version: 1.1.0
Date: 2025-12-26
"""

import json
import urllib.request
import urllib.error
import tempfile
import os
import Grasshopper as gh

# ============================================
# CONFIGURATION - config.py에서 불러오기
# ============================================
try:
    from config import SUPABASE_URL, SUPABASE_KEY
except ImportError:
    print("WARNING: config.py not found. Please copy config.example.py to config.py")
    SUPABASE_URL = ""
    SUPABASE_KEY = ""
DASHBOARD_URL = "http://localhost:3000"

CATEGORIES = ['massing', 'unit_study', 'facade', 'analysis', 'optimization', 'documentation', 'other']


def populate_value_list(nickname, values):
    """
    Find a Value List component by NickName and populate it with values.
    Value List NickName must match the given nickname.

    Args:
        nickname: NickName of the Value List component
        values: List of values (str) or list of tuples (display_name, actual_value)
    """
    try:
        doc = ghenv.Component.OnPingDocument()
        if not doc:
            return False

        for obj in doc.Objects:
            if isinstance(obj, gh.Kernel.Special.GH_ValueList):
                if obj.NickName == nickname:
                    # Clear existing items
                    obj.ListItems.Clear()

                    # Add new items
                    for val in values:
                        if isinstance(val, tuple):
                            # (display_name, actual_value) format
                            display_name, actual_value = val
                            item = gh.Kernel.Special.GH_ValueListItem(display_name, f'"{actual_value}"')
                        else:
                            # Simple string format
                            item = gh.Kernel.Special.GH_ValueListItem(val, f'"{val}"')
                        obj.ListItems.Add(item)

                    # Select first item
                    if obj.ListItems.Count > 0:
                        obj.SelectItem(0)

                    obj.ExpireSolution(False)  # False to prevent infinite loop
                    return True
        return False
    except Exception as e:
        print(f"Value List error: {e}")
        return False

# ============================================
# Helper Functions
# ============================================

def make_request(endpoint, method="GET"):
    """Make HTTP request to Supabase"""
    url = f"{SUPABASE_URL}{endpoint}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    req = urllib.request.Request(url, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        raise Exception(f"HTTP {e.code}: {error_body}")


def get_all_scripts(cat=None):
    """Get all scripts from Script Store"""
    endpoint = "/rest/v1/scripts?select=*&order=download_count.desc"

    if cat and cat in CATEGORIES:
        endpoint += f"&category=eq.{cat}"

    return make_request(endpoint)


def get_script_detail(sid):
    """Get specific script details"""
    endpoint = f"/rest/v1/scripts?id=eq.{sid}&select=*"
    result = make_request(endpoint)
    if result and len(result) > 0:
        return result[0]
    return None


def get_script_versions(sid):
    """Get version history for a script"""
    endpoint = f"/rest/v1/script_versions?script_id=eq.{sid}&select=*&order=created_at.desc"
    return make_request(endpoint)


def format_script_list(script_list):
    """Format script list for display"""
    if not script_list:
        return "No scripts found"

    lines = []
    lines.append("=" * 60)
    lines.append("SCRIPT STORE")
    lines.append("=" * 60)
    lines.append("")

    for i, s in enumerate(script_list, 1):
        lines.append(f"{i}. {s.get('name', 'Unnamed')}")
        lines.append(f"   Category: {s.get('category', '-')} | Version: v{s.get('version', '1.0.0')} | Downloads: {s.get('download_count', 0)}")
        lines.append(f"   ID: {s.get('id', '-')}")
        if s.get('description'):
            desc = s['description'][:80] + "..." if len(s.get('description', '')) > 80 else s.get('description', '')
            lines.append(f"   {desc}")
        lines.append("")

    lines.append("-" * 60)
    lines.append(f"Total: {len(script_list)} scripts")
    lines.append(f"Categories: {', '.join(CATEGORIES)}")

    return "\n".join(lines)


def format_script_detail(script):
    """Format script detail for display"""
    if not script:
        return "Script not found"

    lines = []
    lines.append("=" * 60)
    lines.append(f"SCRIPT: {script.get('name', 'Unnamed')}")
    lines.append("=" * 60)
    lines.append("")
    lines.append(f"ID:          {script.get('id', '-')}")
    lines.append(f"Category:    {script.get('category', '-')}")
    lines.append(f"Version:     v{script.get('version', '1.0.0')}")
    lines.append(f"Author:      {script.get('author', '-')}")
    lines.append(f"Downloads:   {script.get('download_count', 0)}")
    lines.append("")

    if script.get('description'):
        lines.append("Description:")
        lines.append(f"  {script.get('description')}")
        lines.append("")

    if script.get('dependencies'):
        deps = script.get('dependencies', [])
        if deps:
            lines.append(f"Dependencies: {', '.join(deps)}")

    if script.get('tags'):
        tags = script.get('tags', [])
        if tags:
            lines.append(f"Tags: {', '.join(tags)}")

    lines.append("")
    lines.append(f"Dashboard: {DASHBOARD_URL}/scripts/{script.get('id')}")

    if script.get('file_url'):
        lines.append(f"Download: {script.get('file_url')}")

    return "\n".join(lines)


def format_versions(version_list, script_name):
    """Format version list for display"""
    if not version_list:
        return "No version history found"

    lines = []
    lines.append("=" * 60)
    lines.append(f"VERSION HISTORY: {script_name}")
    lines.append("=" * 60)
    lines.append("")

    for i, v in enumerate(version_list):
        is_latest = " [LATEST]" if i == 0 else ""
        lines.append(f"v{v.get('version', '?')}{is_latest}")

        if v.get('changelog'):
            lines.append(f"  {v.get('changelog')}")

        created = v.get('created_at', '')[:10] if v.get('created_at') else '-'
        lines.append(f"  Created: {created}")

        if v.get('file_url'):
            lines.append(f"  File: Available")
        lines.append("")

    lines.append(f"Total versions: {len(version_list)}")

    return "\n".join(lines)


def download_and_load_script(sid):
    """
    Download script from Script Store and load into Grasshopper canvas.
    WARNING: This will replace the current canvas!

    Returns:
        tuple: (success: bool, message: str)
    """
    try:
        import Grasshopper
    except ImportError:
        return (False, "Error: Not running in Grasshopper environment")

    # Get script details
    script = get_script_detail(sid)
    if not script:
        return (False, f"Error: Script not found: {sid}")

    file_url = script.get('file_url')
    if not file_url:
        return (False, f"Error: No file available for script: {script.get('name', sid)}")

    script_name = script.get('name', 'Unknown')
    version = script.get('version', '1.0.0')

    # Determine file extension from URL
    ext = '.gh'
    if file_url.lower().endswith('.ghx'):
        ext = '.ghx'

    # Download to temp folder
    temp_dir = tempfile.gettempdir()
    safe_name = "".join(c for c in script_name if c.isalnum() or c in (' ', '-', '_')).strip()
    temp_path = os.path.join(temp_dir, f"{safe_name}_v{version}{ext}")

    try:
        urllib.request.urlretrieve(file_url, temp_path)
    except Exception as e:
        return (False, f"Error downloading: {str(e)}")

    # Load into Grasshopper
    try:
        io = Grasshopper.Kernel.GH_DocumentIO()
        if io.Open(temp_path):
            doc = io.Document
            Grasshopper.Instances.ActiveCanvas.Document = doc

            # Increment download count
            try:
                increment_download(sid)
            except:
                pass  # Don't fail if increment fails

            return (True, f"Loaded: {script_name} v{version}\nPath: {temp_path}")
        else:
            return (False, f"Error: Failed to open GH file")
    except Exception as e:
        return (False, f"Error loading: {str(e)}")


def increment_download(sid):
    """Increment download count for a script"""
    # Get current count
    script = get_script_detail(sid)
    if not script:
        return

    current_count = script.get('download_count', 0)
    new_count = current_count + 1

    # Update count
    url = f"{SUPABASE_URL}/rest/v1/scripts?id=eq.{sid}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    data = json.dumps({"download_count": new_count}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")

    try:
        urllib.request.urlopen(req)
    except:
        pass  # Silently fail


# ============================================
# Execute
# ============================================

scripts = ""
script_ids = []
versions = ""
load_result = ""

# Input defaults
try:
    load
except NameError:
    load = False

try:
    script_id
except NameError:
    script_id = None

try:
    category
except NameError:
    category = None

# Auto-populate Value List component named "category"
populate_value_list("category", CATEGORIES)

try:
    # Handle load request
    if load and script_id:
        success, message = download_and_load_script(script_id)
        if success:
            load_result = f"✅ {message}"
        else:
            load_result = f"❌ {message}"
        # Note: After loading, the canvas will be replaced
        # so these outputs won't be visible
        scripts = "Loading script..."
        script_ids = [script_id]
        versions = ""
    elif load and not script_id:
        load_result = "⚠️ script_id is required to load a script"
        scripts = "Set script_id and then set load=True"
        script_ids = []
        versions = ""
    elif script_id:
        # Show specific script details and versions
        script_detail = get_script_detail(script_id)
        scripts = format_script_detail(script_detail)
        script_ids = [script_id] if script_detail else []

        # Get versions
        version_list = get_script_versions(script_id)
        script_name = script_detail.get('name', 'Unknown') if script_detail else 'Unknown'
        versions = format_versions(version_list, script_name)

        # Show load hint
        if script_detail and script_detail.get('file_url'):
            load_result = "💡 Set load=True to load this script (replaces current canvas!)"
        else:
            load_result = "⚠️ No file available for this script"
    else:
        # List all scripts
        script_list = get_all_scripts(category)
        scripts = format_script_list(script_list)
        script_ids = [s.get('id') for s in script_list] if script_list else []
        versions = "Select a script from 'Scripts' Value List"
        load_result = "Select a script, then set load=True"

        # Populate "Scripts" Value List with script names and IDs
        if script_list:
            script_items = [
                (f"{s.get('name', 'Unnamed')} (v{s.get('version', '1.0')})", s.get('id'))
                for s in script_list
            ]
            populate_value_list("Scripts", script_items)

except Exception as e:
    scripts = f"Error: {str(e)}"
    script_ids = []
    versions = ""
    load_result = f"Error: {str(e)}"
