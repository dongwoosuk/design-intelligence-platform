# GH Supabase Security Guide

## Table of Contents

1. [Initial Setup](#initial-setup)
2. [Environment Variable Management](#environment-variable-management)
3. [Supabase Security Configuration](#supabase-security-configuration)
4. [Row Level Security (RLS)](#row-level-security-rls)
5. [API Security](#api-security)
6. [Deployment Checklist](#deployment-checklist)

---

## Initial Setup

### 1. Dashboard (Next.js) Environment Variables

```bash
cd dashboard
cp .env.local.example .env.local
```

**Edit `.env.local`:**
```bash
# Copy from Supabase Dashboard: Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key

# Optional: AI description generation
GEMINI_API_KEY=your-gemini-key  # or leave empty
```

**⚠️ Important:**
- **Never commit `.env.local` to Git**
- Verify it is listed in `.gitignore`

### 2. Python Script Configuration (Grasshopper)

```bash
cp config.example.py config.py
```

**Edit `config.py`:**
```python
SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
SUPABASE_KEY = "your-actual-anon-key"
STORAGE_BUCKET = "design-assets"
```

**⚠️ Important:**
- **Never commit `config.py` to Git**
- Verify it is listed in `.gitignore`

---

## Environment Variable Management

### Local Development

**File structure:**
```
dashboard/
├── .env.local.example    # ✅ Commit to Git (template)
├── .env.local            # ❌ Do NOT commit (real keys)
└── .gitignore            # Confirm .env.local is listed

gh_supabase/
├── config.example.py     # ✅ Commit to Git (template)
├── config.py             # ❌ Do NOT commit (real keys)
└── .gitignore            # Confirm config.py is listed
```

### Production Deployment (Vercel)

1. **Vercel Dashboard → Settings → Environment Variables**
2. Add the following variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   GEMINI_API_KEY (optional)
   ```
3. Per-environment configuration:
   - Production: production Supabase project
   - Preview: staging Supabase project
   - Development: local Supabase (optional)

---

## Supabase Security Configuration

### 1. API Key Types

Supabase provides two types of keys:

#### ✅ Anon/Public Key (Safe)
- Safe to use in client-side code
- Protected by Row Level Security (RLS)
- Secure as long as RLS policies are in place

#### ⚠️ Service Role Key (Dangerous)
- **Never expose in client-side code**
- Server-side only (backend APIs, admin tasks)
- Bypasses all RLS policies

### 2. Storage Bucket Configuration

**Supabase Dashboard → Storage → Buckets**

1. **Create `design-assets` bucket:**
   - Public: ✅ (images, screenshots, geometry)
   - File size limit: 50MB

2. **Set Bucket Policies:**
   ```sql
   -- Read: allow all
   CREATE POLICY "Public read access"
   ON storage.objects FOR SELECT
   USING (bucket_id = 'design-assets');

   -- Upload: authenticated users only (after enabling RLS)
   CREATE POLICY "Authenticated users can upload"
   ON storage.objects FOR INSERT
   WITH CHECK (
     bucket_id = 'design-assets'
     AND auth.role() = 'authenticated'
   );
   ```

---

## Row Level Security (RLS)

RLS is currently **disabled**. Enable it before deploying to production.

### 1. Enable RLS

**Supabase Dashboard → Database → Tables → [Table] → RLS**

Click "Enable RLS" for each table:
- `scripts`
- `script_versions`
- `script_screenshots`
- `script_embeddings`
- `projects`
- `design_runs`
- `design_parameters`
- `design_metrics`
- `design_decisions`
- `archived_projects`
- `project_programs`
- `project_media`

### 2. Example RLS Policies

#### Scripts (read: public, write: authenticated)
```sql
-- Read: allow all
CREATE POLICY "Public read access"
ON scripts FOR SELECT
USING (true);

-- Insert: authenticated users only
CREATE POLICY "Authenticated users can insert"
ON scripts FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Update: own scripts only
CREATE POLICY "Users can update own scripts"
ON scripts FOR UPDATE
USING (auth.uid() = user_id);

-- Delete: own scripts only
CREATE POLICY "Users can delete own scripts"
ON scripts FOR DELETE
USING (auth.uid() = user_id);
```

#### Design Runs (project-based access control)
```sql
-- Read: project members only
CREATE POLICY "Project members can read"
ON design_runs FOR SELECT
USING (
  project_id IN (
    SELECT id FROM projects
    WHERE user_id = auth.uid()
    OR id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
  )
);

-- Insert: project owners only
CREATE POLICY "Project members can insert"
ON design_runs FOR INSERT
WITH CHECK (
  project_id IN (
    SELECT id FROM projects
    WHERE user_id = auth.uid()
  )
);
```

### 3. Phased RLS Rollout

**Phase 1: Read-only (apply immediately)**
```sql
-- All tables: allow reads, block writes
CREATE POLICY "Read only" ON [table_name] FOR SELECT USING (true);
```

**Phase 2: Add authentication (within 1–2 weeks)**
```sql
-- Allow writes for authenticated users only
CREATE POLICY "Authenticated write" ON [table_name]
FOR ALL USING (auth.role() = 'authenticated');
```

**Phase 3: Fine-grained permissions (within 1–2 months)**
- Per-user, per-project, and per-role access
- Admin / Editor / Viewer role separation

---

## API Security

### 1. Rate Limiting

**Add Next.js Middleware:**

Create `middleware.ts`:
```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

export function middleware(request: NextRequest) {
  const ip = request.ip ?? '127.0.0.1'
  const now = Date.now()

  const limit = rateLimitMap.get(ip)

  if (limit) {
    if (now > limit.resetTime) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 })
    } else if (limit.count > 100) { // 100 requests per minute
      return new NextResponse('Too Many Requests', { status: 429 })
    } else {
      limit.count++
    }
  } else {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
```

### 2. Input Validation

**File upload validation:**
```typescript
// app/api/scripts/upload/route.ts
const ALLOWED_EXTENSIONS = ['.gh', '.ghx']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File

  const ext = file.name.substring(file.name.lastIndexOf('.'))
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: 'Invalid file type' },
      { status: 400 }
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File too large' },
      { status: 413 }
    )
  }

  // proceed with upload...
}
```

### 3. CORS Configuration

**Allow production domain only:**
```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'https://your-domain.com' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE' },
        ],
      },
    ]
  },
}
```

---

## Deployment Checklist

### 🔴 Required (before deploying)

- [ ] Fill in real keys in `.env.local` (local)
- [ ] Fill in real keys in `config.py` (Grasshopper)
- [ ] Confirm sensitive files are listed in `.gitignore`
- [ ] Verify no keys are exposed in Git history (`git log -p | grep -i "supabase"`)
- [ ] Set Vercel environment variables

### 🟡 Recommended (within 1 week)

- [ ] Enable Row Level Security (RLS)
- [ ] Configure Storage Bucket policies
- [ ] Add API rate limiting
- [ ] Add input validation
- [ ] Enforce HTTPS (enabled by default on Vercel)

### 🟢 Optional (within 1 month)

- [ ] Integrate Supabase Auth (email / OAuth)
- [ ] Implement user role system (Admin / Editor / Viewer)
- [ ] Add audit logging
- [ ] Set up Content Security Policy (CSP)
- [ ] Add Subresource Integrity (SRI)

---

## Security Incident Response

### If Keys Are Exposed

**1. Rotate keys immediately:**
- Supabase Dashboard → Settings → API → Reset Keys

**2. Clean Git history (if keys were committed):**
```bash
# Using BFG Repo-Cleaner
git clone --mirror git://example.com/repo.git
bfg --replace-text passwords.txt repo.git
cd repo.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push
```

**3. Assess impact:**
- Supabase Dashboard → Logs → API Logs
- Review for suspicious requests

**4. Enable RLS immediately:**
- Apply read-only policy first to minimize downtime

### Detecting Suspicious Activity

- Unusual traffic spikes
- Large volumes of requests from unknown IPs
- Sudden increase in Storage usage

**Response:**
1. Tighten rate limiting
2. Block IPs (Vercel Firewall)
3. Temporarily disable the API (emergency)

---

## Additional Resources

- [Supabase Security Best Practices](https://supabase.com/docs/guides/security)
- [Next.js Security Headers](https://nextjs.org/docs/advanced-features/security-headers)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

## Contact

If you discover a security issue:
- GitHub Issues (for non-sensitive reports)
- For sensitive vulnerabilities, please disclose privately before opening a public issue.

**🔒 Responsible Disclosure**
If you find a security vulnerability, please contact us privately before making it public.
