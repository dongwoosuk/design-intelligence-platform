# GH Supabase Security Guide

## 🔐 보안 설정 가이드

이 문서는 gh_supabase 프로젝트를 안전하게 설정하고 운영하기 위한 가이드입니다.

---

## 📋 목차

1. [초기 설정](#초기-설정)
2. [환경 변수 관리](#환경-변수-관리)
3. [Supabase 보안 설정](#supabase-보안-설정)
4. [Row Level Security (RLS)](#row-level-security-rls)
5. [API 보안](#api-보안)
6. [배포 시 체크리스트](#배포-시-체크리스트)

---

## 초기 설정

### 1. Dashboard (Next.js) 환경 변수 설정

```bash
cd dashboard
cp .env.local.example .env.local
```

**`.env.local` 파일 편집:**
```bash
# Supabase 대시보드에서 복사: Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key

# 선택사항: AI 설명 생성
GEMINI_API_KEY=your-gemini-key  # 또는 비워두기
```

**⚠️ 중요:**
- `.env.local`은 **절대 Git에 커밋하지 마세요**
- `.gitignore`에 포함되어 있는지 확인

### 2. Python Scripts 설정 (Grasshopper)

```bash
cd src/gh/gh_supabase
cp config.example.py config.py
```

**`config.py` 파일 편집:**
```python
SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
SUPABASE_KEY = "your-actual-anon-key"
STORAGE_BUCKET = "design-assets"
```

**⚠️ 중요:**
- `config.py`는 **절대 Git에 커밋하지 마세요**
- `.gitignore`에 포함되어 있는지 확인

---

## 환경 변수 관리

### 로컬 개발

**파일 구조:**
```
dashboard/
├── .env.local.example    # ✅ Git에 커밋 (템플릿)
├── .env.local            # ❌ Git에 커밋 안함 (실제 키)
└── .gitignore            # .env.local 포함 확인

src/gh/gh_supabase/
├── config.example.py     # ✅ Git에 커밋 (템플릿)
├── config.py             # ❌ Git에 커밋 안함 (실제 키)
└── .gitignore            # config.py 포함 확인
```

### 프로덕션 배포 (Vercel)

1. **Vercel Dashboard → Settings → Environment Variables**
2. 다음 변수 추가:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   GEMINI_API_KEY (선택)
   ```
3. 환경별 설정:
   - Production: 프로덕션 Supabase 프로젝트
   - Preview: 스테이징 Supabase 프로젝트
   - Development: 로컬 Supabase (선택)

---

## Supabase 보안 설정

### 1. API 키 종류

Supabase는 두 가지 키를 제공합니다:

#### ✅ Anon/Public Key (안전)
- 클라이언트 코드에 사용 가능
- Row Level Security (RLS)로 보호됨
- 공개되어도 RLS 정책이 있으면 안전

#### ⚠️ Service Role Key (위험)
- **절대 클라이언트 코드에 노출 금지**
- 서버 전용 (백엔드 API, 관리자 작업)
- 모든 RLS를 우회함

### 2. Storage Bucket 설정

**Supabase Dashboard → Storage → Buckets**

1. **`design-assets` 버킷 생성:**
   - Public: ✅ (이미지, 스크린샷, 지오메트리)
   - File size limit: 50MB

2. **Bucket Policies 설정:**
   ```sql
   -- 읽기: 모두 허용
   CREATE POLICY "Public read access"
   ON storage.objects FOR SELECT
   USING (bucket_id = 'design-assets');

   -- 업로드: 인증된 사용자만 (RLS 활성화 후)
   CREATE POLICY "Authenticated users can upload"
   ON storage.objects FOR INSERT
   WITH CHECK (
     bucket_id = 'design-assets'
     AND auth.role() = 'authenticated'
   );
   ```

---

## Row Level Security (RLS)

현재 프로젝트는 **RLS가 비활성화**되어 있습니다. 프로덕션 배포 전에 반드시 활성화하세요.

### 1. RLS 활성화

**Supabase Dashboard → Database → Tables → [Table] → RLS**

각 테이블에서 "Enable RLS" 클릭:
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

### 2. 기본 RLS 정책 예시

#### Scripts (읽기: 모두, 쓰기: 인증 사용자)
```sql
-- 읽기: 모두 허용
CREATE POLICY "Public read access"
ON scripts FOR SELECT
USING (true);

-- 생성: 인증된 사용자만
CREATE POLICY "Authenticated users can insert"
ON scripts FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- 수정: 본인이 작성한 것만
CREATE POLICY "Users can update own scripts"
ON scripts FOR UPDATE
USING (auth.uid() = user_id);

-- 삭제: 본인이 작성한 것만
CREATE POLICY "Users can delete own scripts"
ON scripts FOR DELETE
USING (auth.uid() = user_id);
```

#### Design Runs (프로젝트별 접근 제어)
```sql
-- 읽기: 프로젝트 멤버만
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

-- 생성: 프로젝트 멤버만
CREATE POLICY "Project members can insert"
ON design_runs FOR INSERT
WITH CHECK (
  project_id IN (
    SELECT id FROM projects
    WHERE user_id = auth.uid()
  )
);
```

### 3. 단계별 RLS 적용

**Phase 1: 읽기 전용 (즉시 적용)**
```sql
-- 모든 테이블: 읽기는 허용, 쓰기는 차단
CREATE POLICY "Read only" ON [table_name] FOR SELECT USING (true);
```

**Phase 2: 인증 추가 (1-2주 후)**
```sql
-- 인증된 사용자만 쓰기 허용
CREATE POLICY "Authenticated write" ON [table_name]
FOR ALL USING (auth.role() = 'authenticated');
```

**Phase 3: 세밀한 권한 (1-2개월 후)**
- 사용자별, 프로젝트별, 역할별 권한 설정
- Admin, Editor, Viewer 역할 구분

---

## API 보안

### 1. Rate Limiting (속도 제한)

**Next.js Middleware 추가:**

**`middleware.ts` 생성:**
```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

export function middleware(request: NextRequest) {
  const ip = request.ip ?? '127.0.0.1'
  const now = Date.now()

  // IP별 요청 제한 확인
  const limit = rateLimitMap.get(ip)

  if (limit) {
    // 제한 시간 초과 시 리셋
    if (now > limit.resetTime) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 }) // 1분
    } else if (limit.count > 100) { // 분당 100 요청
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

### 2. Input Validation (입력 검증)

**파일 업로드 검증:**
```typescript
// app/api/scripts/upload/route.ts
const ALLOWED_EXTENSIONS = ['.gh', '.ghx']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File

  // 파일 확장자 검증
  const ext = file.name.substring(file.name.lastIndexOf('.'))
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: 'Invalid file type' },
      { status: 400 }
    )
  }

  // 파일 크기 검증
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File too large' },
      { status: 413 }
    )
  }

  // 업로드 진행...
}
```

### 3. CORS 설정

**프로덕션 도메인만 허용:**
```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'https://ids.steinberghart.com' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE' },
        ],
      },
    ]
  },
}
```

---

## 배포 시 체크리스트

### 🔴 필수 (배포 전)

- [ ] `.env.local`에 실제 키 입력 (로컬)
- [ ] `config.py`에 실제 키 입력 (Grasshopper)
- [ ] `.gitignore`에 민감 파일 포함 확인
- [ ] Git history에 키 노출 확인 (`git log -p | grep -i "supabase"`)
- [ ] Vercel 환경 변수 설정

### 🟡 권장 (1주 내)

- [ ] Row Level Security (RLS) 활성화
- [ ] Storage Bucket 정책 설정
- [ ] API Rate Limiting 추가
- [ ] Input Validation 추가
- [ ] HTTPS 강제 (Vercel은 기본 활성화)

### 🟢 선택 (1개월 내)

- [ ] Supabase Auth 통합 (이메일/OAuth)
- [ ] 사용자 역할 시스템 (Admin/Editor/Viewer)
- [ ] 감사 로그 (audit log)
- [ ] Content Security Policy (CSP)
- [ ] Subresource Integrity (SRI)

---

## 보안 사고 대응

### 키 노출 시 조치

**1. 즉시 키 회전:**
- Supabase Dashboard → Settings → API → Reset Keys

**2. Git history 정리 (키가 커밋된 경우):**
```bash
# BFG Repo-Cleaner 사용
git clone --mirror git://example.com/repo.git
bfg --replace-text passwords.txt repo.git
cd repo.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push
```

**3. 영향 범위 확인:**
- Supabase Dashboard → Logs → API Logs
- 의심스러운 요청 확인

**4. RLS 즉시 활성화:**
- 읽기 전용 정책 우선 적용
- 서비스 중단 최소화

### 의심스러운 활동 감지

- 비정상적인 트래픽 증가
- 알 수 없는 IP에서의 대량 요청
- Storage 사용량 급증

**대응:**
1. Rate Limiting 강화
2. IP 차단 (Vercel Firewall)
3. 일시적 API 비활성화 (긴급)

---

## 추가 리소스

- [Supabase Security Best Practices](https://supabase.com/docs/guides/security)
- [Next.js Security Headers](https://nextjs.org/docs/advanced-features/security-headers)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

## 문의

보안 관련 문제 발견 시:
- Email: [your-security-email]
- GitHub Issues: [링크]

**🔒 책임있는 공개 (Responsible Disclosure)**
보안 취약점을 발견하셨다면, 공개 이슈 대신 비공개로 먼저 알려주세요.
