# Security Incident Report

**Date:** 2026-01-13
**Severity:** 🔴 **CRITICAL**
**Status:** Resolved — Keys rotated, .gitignore updated

---

## Summary

Multiple API keys and credentials were found exposed in version control history. The files have since been removed from tracking and all credentials have been rotated.

---

## Exposed Credentials

### 1. Supabase Credentials
- **File:** `dashboard/.env.local`
- **Exposed:** Supabase Project URL and Anon Key
- **Risk:** Unauthorized database access
- **Action Taken:** 🟢 Keys rotated

### 2. Gemini API Key
- **File:** `dashboard/.env.local`
- **Exposed:** Google Gemini API Key
- **Risk:** Unauthorized AI API usage, quota depletion, unexpected cost
- **Action Taken:** 🟢 Key rotated

### 3. Autodesk Platform Services (APS)
- **File:** `dashboard/.env.local`
- **Exposed:** APS Client ID and Client Secret
- **Risk:** Unauthorized access to Autodesk ACC / BIM 360 data
- **Action Taken:** 🟢 Credentials rotated

---

## Actions Taken

### ✅ Completed

1. **Updated `.gitignore`:**
   - Added `*.env.*` pattern to catch all environment file variants
   - Added `config.py` exclusion (with `!config.example.py` exception)
   - Created `dashboard/.gitignore`

2. **Removed from tracking:**
   - `dashboard/.env.local` removed from git index
   - File remains on local disk (not deleted)

3. **Created security infrastructure:**
   - `config.example.py` template for Python scripts
   - `SECURITY.md` comprehensive security guide
   - `.env.local.example` template for Next.js

4. **Updated code:**
   - `supabase_connector.py` now loads credentials from `config.py`
   - `ghpython_supabase_save_with_screenshot.py` now loads from `config.py`

5. **All exposed keys rotated** (Supabase, Gemini, Autodesk APS)

---

## Timeline

- **Exposure Date:** Unknown (likely since project initialization)
- **Discovery Date:** 2026-01-13
- **Mitigation Completed:** 2026-01-13 (keys rotated, .gitignore fixed)

---

## Impact Assessment

### Risk Level at Time of Discovery: 🔴 HIGH

| Vector | Impact |
|--------|--------|
| Database Access | Supabase anon key exposed; RLS was not enabled |
| AI API Abuse | Gemini API key exposed (quota / cost risk) |
| BIM Data Access | Autodesk APS credentials exposed |
| Git History | Credentials remained in history until cleaned |

---

## Lessons Learned

1. **Never commit environment files** — even "local" files can end up in git
2. **Use `.gitignore` from day one** — don't wait until after files are tracked
3. **Template files only** — only commit `.example` files with placeholders
4. **Regular audits** — scan git history for accidentally committed secrets
5. **Pre-commit hooks** — consider `git-secrets` or similar tools

---

## Prevention Measures (Implemented)

✅ **Configuration templates** — `config.example.py` and `.env.local.example`
✅ **Improved `.gitignore`** — catches `*.env.*` and excludes `config.py`
✅ **Security documentation** — `SECURITY.md` with full security guide
✅ **Credential-free code** — all hardcoded secrets removed

---

## References

- [SECURITY.md](./SECURITY.md) — Comprehensive security guide
- [Supabase Security Best Practices](https://supabase.com/docs/guides/security)
- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

---

**Report Generated:** 2026-01-13 by Claude Code
