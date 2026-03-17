"""
Rhino.Inside.Revit: 간단한 Revit → Supabase 업로드
메타데이터만 추출 (3D 없음)

@input: project_name, gross_area, net_area, floor_count, building_height, unit_count, unit_mix_str, parking_count, far, note, upload
@output: result, run_id

=== 입력 ===
project_name (str): 프로젝트명 (필수)
gross_area (float): 연면적 sqft
net_area (float): 전용면적 sqft
floor_count (int): 층수
building_height (float): 건물 높이 ft
unit_count (int): 총 유닛 수
unit_mix_str (str): 유닛 믹스 JSON 문자열 (예: {"studio":10,"1br":20})
parking_count (int): 주차 대수
far (float): 용적률
note (str): 메모
upload (bool): 업로드 버튼

=== 사용법 ===
1. Revit 스케줄에서 데이터 확인
2. Grasshopper에서 값 입력
3. Upload 버튼 클릭
4. 대시보드에서 확인
"""

import requests
import json

# ============================================================
# SUPABASE 설정 - config.py에서 불러오기
# ============================================================
try:
    from config import SUPABASE_URL, SUPABASE_KEY
except ImportError:
    print("WARNING: config.py not found. Please copy config.example.py to config.py")
    SUPABASE_URL = ""
    SUPABASE_KEY = ""

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# ============================================================
# 헬퍼 함수
# ============================================================

def safe_float(val, default=None):
    try:
        if val is None or val == "":
            return default
        return float(val)
    except (ValueError, TypeError):
        return default

def safe_int(val, default=None):
    try:
        if val is None or val == "":
            return default
        return int(val)
    except (ValueError, TypeError):
        return default

def parse_unit_mix(val):
    if val is None or val == "":
        return None
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, ValueError):
            return None
    return None

# ============================================================
# 메인 로직
# ============================================================

result = ""
run_id = ""

# Input 기본값
try:
    upload
except NameError:
    upload = False

try:
    project_name
except NameError:
    project_name = ""

try:
    note
except NameError:
    note = ""

try:
    gross_area
except NameError:
    gross_area = None

try:
    net_area
except NameError:
    net_area = None

try:
    floor_count
except NameError:
    floor_count = None

try:
    building_height
except NameError:
    building_height = None

try:
    unit_count
except NameError:
    unit_count = None

try:
    unit_mix_str
except NameError:
    unit_mix_str = None

try:
    parking_count
except NameError:
    parking_count = None

try:
    far
except NameError:
    far = None

if upload:
    if not project_name:
        result = "Error: project_name이 필요합니다"
    else:
        try:
            # 1. 프로젝트 찾기 또는 생성
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/projects?name=eq.{project_name}",
                headers=HEADERS
            )
            projects = resp.json()

            if projects:
                project_id = projects[0]["id"]
                # 기존 프로젝트를 completed로 업데이트
                requests.patch(
                    f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}",
                    headers=HEADERS,
                    json={"phase": "completed"}
                )
            else:
                resp = requests.post(
                    f"{SUPABASE_URL}/rest/v1/projects",
                    headers=HEADERS,
                    json={
                        "name": project_name,
                        "phase": "completed",
                        "project_type": "internal"
                    }
                )
                resp.raise_for_status()
                data = resp.json()
                if not data:
                    raise ValueError("Empty response creating project")
                project_id = data[0]["id"]

            # 2. Design Run 생성
            run_data = {
                "project_id": project_id,
                "method": "manual",
                "source": "revit",
                "purpose": "as_built",
                "is_selected": True,
                "note": note if note else "Revit에서 수동 입력",
                "gross_area": safe_float(gross_area),
                "net_area": safe_float(net_area),
                "far_actual": safe_float(far),
                "floor_count": safe_int(floor_count),
                "building_height": safe_float(building_height),
                "unit_count": safe_int(unit_count),
                "unit_mix": parse_unit_mix(unit_mix_str),
                "parking_count": safe_int(parking_count),
            }

            # None 값 제거
            run_data = {k: v for k, v in run_data.items() if v is not None}

            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/design_runs",
                headers=HEADERS,
                json=run_data
            )

            if resp.status_code in [200, 201]:
                data = resp.json()
                if not data:
                    raise ValueError("Empty response creating design_run")
                run_id = data[0]["id"]
                result = f"""
업로드 완료!

Project: {project_name}
Run ID: {run_id[:8]}...
Phase: completed
Source: revit

=== 저장된 데이터 ===
GFA: {gross_area or '-'} sqft
Net: {net_area or '-'} sqft
FAR: {far or '-'}
Floors: {floor_count or '-'}
Height: {building_height or '-'} ft
Units: {unit_count or '-'}
Parking: {parking_count or '-'}

대시보드에서 확인하세요:
http://localhost:3000/projects/{project_id}
"""
            else:
                result = f"Error: {resp.status_code} - {resp.text}"

        except Exception as e:
            result = f"Error: {str(e)}"

else:
    result = """
=== Revit → Supabase 업로더 (Simple) ===

사용법:
1. 아래 입력값 연결:
   - project_name (필수)
   - gross_area, net_area
   - floor_count, building_height
   - unit_count, unit_mix_str
   - parking_count, far
   - note

2. Upload 버튼 클릭

Tip: unit_mix_str 예시
  {"studio":10,"1br":25,"2br":15}
"""

print(result)
