# Design Intelligence Platform

AEC 설계 워크플로우를 위한 Grasshopper ↔ Supabase 연동 플랫폼.
GH 스크립트 버전 관리 + 설계 파라미터/메트릭 저장 + 최적화 대시보드.

## Features

- **Grasshopper 스크립트 업로드/버전 관리** — GH definition을 Script Store에 저장, 버전 이력 추적
- **설계 옵션 파라미터 & 메트릭 저장** — Supabase PostgreSQL 기반 설계 데이터 영속화
- **Nelder-Mead 최적화 내장** — 설계 파라미터 자동 최적화
- **Wallacei 결과 임포트** — Wallacei 진화 최적화 결과 연동
- **Revit RIR 데이터 추출** — Revit Inside Rhino (RIR)을 통한 Revit 데이터 수집
- **Next.js 웹 대시보드** — 스크립트 목록, 설계 메트릭 시각화, 최적화 결과 비교

## Project Structure

```
gh_supabase/
├── ghpython_script_upload.py      # GH Python: 스크립트 업로드
├── ghpython_version_upload.py     # GH Python: 버전 업로드
├── ghpython_design_upload.py      # GH Python: 설계 파라미터/메트릭 업로드
├── config.example.py              # Supabase 설정 템플릿 (config.py로 복사 후 사용)
├── dashboard/                     # Next.js 웹 대시보드
│   ├── .env.local.example         # 환경변수 템플릿
│   ├── app/                       # Next.js App Router
│   └── public/rhino3dm/           # rhino3dm.js 라이브러리 (open-source)
└── supabase/                      # DB 마이그레이션 스키마
```

## Setup

### 1. Supabase 프로젝트 생성

[supabase.com](https://supabase.com)에서 새 프로젝트를 생성하고 Project URL과 anon key를 복사합니다.

### 2. GH Python 설정

```bash
cp config.example.py config.py
```

`config.py`를 열고 Supabase 키를 입력합니다:

```python
SUPABASE_URL = "https://your-project.supabase.co"
SUPABASE_KEY = "your-anon-key"
```

### 3. 대시보드 설정

```bash
cd dashboard
cp .env.local.example .env.local
```

`.env.local`을 열고 키를 입력한 후:

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

### 4. 환경변수 (선택)

대시보드 URL을 변경하려면 `DASHBOARD_URL` 환경변수를 설정합니다:

```bash
# Windows
set DASHBOARD_URL=http://your-server:3000

# macOS/Linux
export DASHBOARD_URL=http://your-server:3000
```

## Usage

### Grasshopper에서 스크립트 업로드

1. Grasshopper에서 `ghpython_script_upload.py`를 GH Python 컴포넌트에 붙여넣습니다.
2. `config.py` 경로를 GH Python 경로에 추가합니다.
3. `upload` 입력을 `True`로 설정하면 현재 GH definition이 Script Store에 업로드됩니다.

### 설계 파라미터 저장

`ghpython_design_upload.py`를 사용하여 GH 파라미터와 메트릭을 Supabase에 저장합니다. 대시보드에서 결과를 비교하고 최적 옵션을 탐색합니다.

## Database Schema

`supabase/` 폴더의 마이그레이션 파일을 Supabase SQL Editor에서 실행합니다.

## License

[AGPL-3.0](LICENSE) — 이 소프트웨어를 SaaS 형태로 제공할 경우 소스 코드 공개 의무가 있습니다.
상업적 이용을 위한 별도 라이선스 문의는 이슈로 남겨주세요.
