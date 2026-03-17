"""
GHPython Component: Supabase 프로젝트 목록 → Value List 업데이트
Rhino 8 CPython 전용 (v2.0 - Extended Schema)

@input: refresh, filter_phase
@output: project_names, project_details

=== 입력 ===
refresh (bool): 새로고침 버튼
filter_phase (str): 페이즈 필터 - 'all' | 'SD' | 'DD' | 'CD' | 'completed' | 'archived' (optional)

=== 출력 ===
project_names (list): 프로젝트명 목록
project_details (list): 프로젝트 상세 정보 (dict 형태)

사용법:
1. Value List 추가 → NickName "Projects" → load.py의 project_name에 연결
2. (선택) Value List "Phases" → filter_phase에 연결
3. (선택) Value List "Sources" → load.py의 filter_source 또는 save.py의 source에 연결
4. (선택) Value List "Purposes" → save.py의 purpose에 연결
5. Button → refresh에 연결 → 클릭 시 모든 Value List 자동 업데이트
"""

import requests
import Grasshopper as gh

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

# Value List 컴포넌트의 NickName
VALUE_LIST_NICKNAME = "Projects"
PHASES_LIST_NICKNAME = "Phases"
SOURCES_LIST_NICKNAME = "Sources"
PURPOSES_LIST_NICKNAME = "Purposes"

# 페이즈 옵션 목록
PHASE_OPTIONS = [
    ("All Phases", "all"),
    ("SD - Schematic Design", "SD"),
    ("DD - Design Development", "DD"),
    ("CD - Construction Documents", "CD"),
    ("Completed", "completed"),
    ("Archived", "archived"),
]

# 소스 옵션 목록 (load.py filter_source, save.py source 공용)
SOURCE_OPTIONS = [
    ("All Sources", "all"),
    ("Grasshopper", "grasshopper"),
    ("Wallacei", "wallacei"),
    ("Revit", "revit"),
    ("Manual", "manual"),
]

# 목적 옵션 목록
PURPOSE_OPTIONS = [
    ("Massing Study", "massing_study"),
    ("Optimization", "optimization"),
    ("Documentation", "documentation"),
    ("As-Built", "as_built"),
]

# ============================================================
# 메인 로직
# ============================================================

project_names = []
project_details = []

# Input 기본값 설정
try:
    refresh
except NameError:
    refresh = False

try:
    filter_phase
except NameError:
    filter_phase = "all"

if refresh:
    try:
        # 1. Supabase에서 프로젝트 목록 조회
        query = f"{SUPABASE_URL}/rest/v1/projects?order=name.asc"

        if filter_phase and filter_phase != "all":
            query += f"&phase=eq.{filter_phase}"

        resp = requests.get(query, headers=HEADERS)
        resp.raise_for_status()
        projects = resp.json()

        print(f"Supabase에서 {len(projects)}개 프로젝트 조회됨")

        for p in projects:
            name = p["name"]
            phase = p.get("phase", "SD")
            project_type = p.get("project_type", "internal")
            program_type = p.get("program_type", "")
            location = p.get("location", "")
            site_area = p.get("site_area", 0)

            project_names.append(name)
            project_details.append({
                "id": p["id"],
                "name": name,
                "phase": phase,
                "project_type": project_type,
                "program_type": program_type,
                "location": location,
                "site_area": site_area,
            })

        # 2. Value List 컴포넌트 찾아서 업데이트
        doc = ghenv.Component.OnPingDocument()
        value_list_found = False

        for obj in doc.Objects:
            if isinstance(obj, gh.Kernel.Special.GH_ValueList):
                if obj.NickName == VALUE_LIST_NICKNAME:
                    value_list_found = True

                    obj.ListItems.Clear()
                    for p in projects:
                        name = p["name"]
                        phase = p.get("phase", "SD")
                        # 표시: "ProjectName (SD)" 형태
                        display_name = f"{name} ({phase})"
                        item = gh.Kernel.Special.GH_ValueListItem(display_name, f'"{name}"')
                        obj.ListItems.Add(item)

                    if obj.ListItems.Count > 0:
                        obj.SelectItem(0)

                    obj.ExpireSolution(False)  # False로 변경하여 무한 루프 방지
                    print(f"Value List '{VALUE_LIST_NICKNAME}' 업데이트 완료!")
                    break

        if not value_list_found:
            print(f"경고: NickName이 '{VALUE_LIST_NICKNAME}'인 Value List를 찾을 수 없습니다")
            print("Value List 컴포넌트를 추가하고 NickName을 'Projects'로 변경하세요")

        # 3. Phases Value List 업데이트
        phases_list_found = False
        for obj in doc.Objects:
            if isinstance(obj, gh.Kernel.Special.GH_ValueList):
                if obj.NickName == PHASES_LIST_NICKNAME:
                    phases_list_found = True

                    obj.ListItems.Clear()
                    for display_name, value in PHASE_OPTIONS:
                        item = gh.Kernel.Special.GH_ValueListItem(display_name, f'"{value}"')
                        obj.ListItems.Add(item)

                    if obj.ListItems.Count > 0:
                        obj.SelectItem(0)

                    obj.ExpireSolution(False)
                    print(f"Value List '{PHASES_LIST_NICKNAME}' 업데이트 완료!")
                    break

        if not phases_list_found:
            print(f"(선택사항) NickName이 '{PHASES_LIST_NICKNAME}'인 Value List가 없습니다")

        # 4. Sources Value List 업데이트
        for obj in doc.Objects:
            if isinstance(obj, gh.Kernel.Special.GH_ValueList):
                if obj.NickName == SOURCES_LIST_NICKNAME:
                    obj.ListItems.Clear()
                    for display_name, value in SOURCE_OPTIONS:
                        item = gh.Kernel.Special.GH_ValueListItem(display_name, f'"{value}"')
                        obj.ListItems.Add(item)
                    if obj.ListItems.Count > 0:
                        obj.SelectItem(0)
                    obj.ExpireSolution(False)
                    print(f"Value List '{SOURCES_LIST_NICKNAME}' 업데이트 완료!")
                    break

        # 5. Purposes Value List 업데이트
        for obj in doc.Objects:
            if isinstance(obj, gh.Kernel.Special.GH_ValueList):
                if obj.NickName == PURPOSES_LIST_NICKNAME:
                    obj.ListItems.Clear()
                    for display_name, value in PURPOSE_OPTIONS:
                        item = gh.Kernel.Special.GH_ValueListItem(display_name, f'"{value}"')
                        obj.ListItems.Add(item)
                    if obj.ListItems.Count > 0:
                        obj.SelectItem(0)
                    obj.ExpireSolution(False)
                    print(f"Value List '{PURPOSES_LIST_NICKNAME}' 업데이트 완료!")
                    break

        # 프로젝트 목록 출력
        print("\n프로젝트 목록:")
        for i, p in enumerate(projects):
            phase = p.get("phase", "SD")
            ptype = p.get("program_type", "-")
            print(f"  {i+1}. {p['name']} [{phase}] - {ptype}")

    except Exception as e:
        print(f"Error: {str(e)}")

else:
    print("Refresh 버튼을 눌러 프로젝트 목록을 불러오세요")
