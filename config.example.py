"""
Supabase Configuration for Grasshopper Scripts
================================================

SETUP INSTRUCTIONS:
1. Copy this file to 'config.py' in the same directory
2. Fill in your actual Supabase credentials
3. DO NOT commit config.py to version control (it's in .gitignore)

Get your credentials from:
https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
"""

# ============================================================
# SUPABASE CREDENTIALS - REPLACE WITH YOUR VALUES
# ============================================================

# Your Supabase project URL
# Example: https://abcdefghijklmnop.supabase.co
SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"

# Your Supabase anon/public key
# This is safe to use in client-side code, but still should not be committed
SUPABASE_KEY = "your-anon-key-here"

# ============================================================
# STORAGE CONFIGURATION
# ============================================================

# Name of your storage bucket for design assets
# Create this bucket in Supabase Dashboard → Storage
STORAGE_BUCKET = "design-assets"

# ============================================================
# OPTIONAL: Gemini API Key
# ============================================================

# For AI-powered script descriptions (optional)
# Get from: https://aistudio.google.com/app/apikey
GEMINI_API_KEY = ""

# ============================================================
# NOTES
# ============================================================

"""
SECURITY BEST PRACTICES:

1. Never commit config.py to Git
   - It's already in .gitignore
   - Only commit config.example.py

2. Use Row Level Security (RLS) in Supabase
   - Enable RLS on all tables
   - Set up policies for read/write access

3. Consider using service role key for server operations
   - Keep service role key VERY secure (never in client code)
   - Only use in trusted server environments

4. Rotate keys periodically
   - Generate new keys from Supabase dashboard
   - Update config.py with new keys
"""
