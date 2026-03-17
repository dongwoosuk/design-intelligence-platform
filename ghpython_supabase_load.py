"""
GHPython Component: Supabase에서 디자인 옵션 불러오기
Rhino 8 CPython 전용 (v2.0 - Extended Schema)

@input: project_name, refresh, filter_source, filter_selected_only
@output: options, summaries, run_ids, heights, floors, fars, gfas, unit_counts, sources, is_selected_list

=== 입력 ===
project_name (str): 프로젝트명
refresh (bool): 새로고침 버튼
filter_source (str): 소스 필터 - 'all' | 'grasshopper' | 'wallacei' | 'revit' (optional)
filter_selected_only (bool): 선택된 옵션만 표시 (optional)

=== 출력 ===
options (list): 옵션 목록 (dict 형태)
summaries (list): 요약 (가독성 좋은 한줄 요약)
run_ids (list): Run ID 목록
heights (list): 건물 높이
floors (list): 층수
fars (list): FAR 값
gfas (list): GFA 값
unit_counts (list): 유닛 수
sources (list): 데이터 소스
is_selected_list (list): 선택 여부
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
    "Content-Type": "application/json"
}

# ============================================================
# 메인 로직
# ============================================================

options = []
summaries = []
run_ids = []
heights = []
floors = []
fars = []
gfas = []
unit_counts = []
sources = []
is_selected_list = []

# Input 기본값 설정
try:
    refresh
except NameError:
    refresh = False

try:
    filter_source
except NameError:
    filter_source = "all"

try:
    filter_selected_only
except NameError:
    filter_selected_only = False

try:
    project_name
except NameError:
    project_name = ""

if refresh and project_name:
    try:
        # 1. 프로젝트 찾기
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/projects?name=eq.{project_name}",
            headers=HEADERS
        )
        resp.raise_for_status()
        projects = resp.json()

        if not projects:
            print(f"프로젝트 '{project_name}'를 찾을 수 없습니다")
        else:
            project = projects[0]
            project_id = project["id"]
            project_phase = project.get("phase", "SD")

            print(f"프로젝트: {project_name} (Phase: {project_phase})")

            # 2. Design Runs 조회 (필터 적용)
            query = f"{SUPABASE_URL}/rest/v1/design_runs?project_id=eq.{project_id}&order=created_at.desc"

            if filter_source and filter_source != "all":
                query += f"&source=eq.{filter_source}"

            if filter_selected_only:
                query += "&is_selected=eq.true"

            resp = requests.get(query, headers=HEADERS)
            runs = resp.json()

            print(f"총 {len(runs)}개 옵션 발견")

            for run in runs:
                run_id = run["id"]

                # 새 스키마: design_runs에서 직접 값 읽기
                height = run.get("building_height") or 0
                floor_count = run.get("floor_count") or 0
                far = run.get("far_actual") or 0
                gfa = run.get("gross_area") or 0
                net_area = run.get("net_area") or 0
                unit_count = run.get("unit_count") or 0
                unit_mix = run.get("unit_mix") or {}
                parking = run.get("parking_count") or 0
                lot_cov = run.get("lot_coverage") or 0
                source = run.get("source") or "grasshopper"
                purpose = run.get("purpose") or "massing_study"
                is_selected = run.get("is_selected") or False
                note = run.get("note") or ""
                method = run.get("method") or "manual"

                # design_parameters 항상 조회 (INPUT 슬라이더 값들)
                resp = requests.get(
                    f"{SUPABASE_URL}/rest/v1/design_parameters?run_id=eq.{run_id}",
                    headers=HEADERS
                )
                params = {p["name"]: p["value_numeric"] for p in resp.json()}

                # 하위 호환: design_runs에 값이 없으면 params에서 가져옴
                if height == 0:
                    height = params.get("height", 0)
                if floor_count == 0:
                    floor_count = params.get("floor_count", 0)

                # Metrics 조회 (하위 호환)
                if far == 0 or gfa == 0:
                    resp = requests.get(
                        f"{SUPABASE_URL}/rest/v1/design_metrics?run_id=eq.{run_id}",
                        headers=HEADERS
                    )
                    metrics = {m["name"]: m["value"] for m in resp.json()}

                    if far == 0:
                        far = metrics.get("FAR", 0)
                    if gfa == 0:
                        gfa = metrics.get("GFA", 0)

                # 옵션 딕셔너리 생성
                option = {
                    "run_id": run_id,
                    "source": source,
                    "purpose": purpose,
                    "method": method,
                    "is_selected": is_selected,
                    "note": note,
                    "building_height": height,
                    "floor_count": floor_count,
                    "far_actual": far,
                    "gross_area": gfa,
                    "net_area": net_area,
                    "unit_count": unit_count,
                    "unit_mix": unit_mix,
                    "parking_count": parking,
                    "lot_coverage": lot_cov,
                    "screenshot_url": run.get("screenshot_url", ""),
                    "geometry_url": run.get("geometry_url", ""),
                    "params": params,  # INPUT 슬라이더 값들 (height, setback_north, etc.)
                }
                options.append(option)

                # 요약 생성
                gfa_fmt = f"{gfa:,.0f}" if isinstance(gfa, (int, float)) else gfa
                selected_mark = "[*]" if is_selected else ""
                summary = f"{selected_mark}[{source}] FAR:{far:.2f} | GFA:{gfa_fmt}sqft | Height:{height}ft | Floors:{floor_count} | Units:{unit_count} | {note}"
                summaries.append(summary)

                # 개별 리스트
                run_ids.append(run_id)
                heights.append(height)
                floors.append(floor_count)
                fars.append(far)
                gfas.append(gfa)
                unit_counts.append(unit_count)
                sources.append(source)
                is_selected_list.append(is_selected)

                print(f"  - [{source}] FAR={far:.2f}, Height={height}, Selected={is_selected}")

    except Exception as e:
        print(f"Error: {str(e)}")

elif not project_name:
    print("프로젝트명을 입력하세요")
else:
    print("Refresh 버튼을 눌러 데이터를 불러오세요")
