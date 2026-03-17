"""
Grasshopper ↔ Supabase Connector
Rhino 8 CPython에서 사용 가능

사용법:
    1. config.example.py를 config.py로 복사하고 실제 값 입력
    2. 이 파일을 GHPython 컴포넌트에서 import
    3. 또는 코드를 직접 복사해서 사용
"""

import requests
from typing import Optional, List, Dict, Any
from datetime import datetime

# ============================================================
# SUPABASE 설정 - config.py에서 불러오기
# ============================================================
try:
    from config import SUPABASE_URL, SUPABASE_KEY
except ImportError:
    # config.py가 없으면 기본값 사용 (개발/테스트용)
    # 프로덕션에서는 반드시 config.py를 생성하세요!
    print("WARNING: config.py not found. Using placeholder values.")
    print("Please copy config.example.py to config.py and fill in your credentials.")
    SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
    SUPABASE_KEY = "your-anon-key-here"

# ============================================================
# 기본 헤더
# ============================================================
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# ============================================================
# 기본 CRUD 함수들
# ============================================================

def get_all(table: str) -> List[Dict]:
    """테이블의 모든 데이터 조회"""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()
    return response.json()


def get_by_id(table: str, id: str) -> Optional[Dict]:
    """ID로 단일 레코드 조회"""
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{id}"
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()
    data = response.json()
    return data[0] if data else None


def insert(table: str, data: Dict) -> Dict:
    """새 레코드 삽입"""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    response = requests.post(url, headers=HEADERS, json=data)
    response.raise_for_status()
    result = response.json()
    if not result:
        raise ValueError(f"Empty response from insert into {table}")
    return result[0]


def update(table: str, id: str, data: Dict) -> Dict:
    """레코드 업데이트"""
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{id}"
    response = requests.patch(url, headers=HEADERS, json=data)
    response.raise_for_status()
    result = response.json()
    if not result:
        raise ValueError(f"Empty response from update on {table} id={id}")
    return result[0]


def delete(table: str, id: str) -> bool:
    """레코드 삭제"""
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{id}"
    response = requests.delete(url, headers=HEADERS)
    response.raise_for_status()
    return True


# ============================================================
# 프로젝트 관련 함수
# ============================================================

def get_projects() -> List[Dict]:
    """모든 프로젝트 조회"""
    return get_all("projects")


def get_project_by_name(name: str) -> Optional[Dict]:
    """프로젝트명으로 조회"""
    url = f"{SUPABASE_URL}/rest/v1/projects?name=eq.{name}"
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()
    data = response.json()
    return data[0] if data else None


def create_project(name: str) -> Dict:
    """새 프로젝트 생성"""
    return insert("projects", {"name": name})


# ============================================================
# Design Run 관련 함수
# ============================================================

def get_runs_by_project(project_id: str) -> List[Dict]:
    """프로젝트의 모든 Design Run 조회"""
    url = f"{SUPABASE_URL}/rest/v1/design_runs?project_id=eq.{project_id}&order=created_at.desc"
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()
    return response.json()


def create_run(project_id: str, method: str = "manual", note: str = "") -> Dict:
    """새 Design Run 생성

    Args:
        project_id: 프로젝트 UUID
        method: 'wallacei', 'scipy', 'manual' 중 하나
        note: 메모
    """
    return insert("design_runs", {
        "project_id": project_id,
        "method": method,
        "note": note
    })


# ============================================================
# Design Parameters 관련 함수
# ============================================================

def get_parameters_by_run(run_id: str) -> List[Dict]:
    """Run의 모든 파라미터 조회"""
    url = f"{SUPABASE_URL}/rest/v1/design_parameters?run_id=eq.{run_id}"
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()
    return response.json()


def save_parameters(run_id: str, params: Dict[str, float]) -> List[Dict]:
    """파라미터들 일괄 저장

    Args:
        run_id: Design Run UUID
        params: {"height": 85.5, "setback": 15.0, ...}
    """
    records = [
        {"run_id": run_id, "name": name, "value_numeric": value}
        for name, value in params.items()
    ]
    url = f"{SUPABASE_URL}/rest/v1/design_parameters"
    response = requests.post(url, headers=HEADERS, json=records)
    response.raise_for_status()
    return response.json()


# ============================================================
# Design Metrics 관련 함수
# ============================================================

def get_metrics_by_run(run_id: str) -> List[Dict]:
    """Run의 모든 메트릭 조회"""
    url = f"{SUPABASE_URL}/rest/v1/design_metrics?run_id=eq.{run_id}"
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()
    return response.json()


def save_metrics(run_id: str, metrics: Dict[str, tuple]) -> List[Dict]:
    """메트릭들 일괄 저장

    Args:
        run_id: Design Run UUID
        metrics: {"FAR": (4.8, None), "GFA": (125000, "sqft"), ...}
                 형식: {name: (value, unit)}
    """
    records = [
        {"run_id": run_id, "name": name, "value": val[0], "unit": val[1]}
        for name, val in metrics.items()
    ]
    url = f"{SUPABASE_URL}/rest/v1/design_metrics"
    response = requests.post(url, headers=HEADERS, json=records)
    response.raise_for_status()
    return response.json()


# ============================================================
# 통합 함수 - Grasshopper에서 바로 사용
# ============================================================

def save_design_option(
    project_name: str,
    method: str,
    note: str,
    parameters: Dict[str, float],
    metrics: Dict[str, tuple]
) -> Dict:
    """디자인 옵션 전체 저장 (프로젝트 → Run → Params → Metrics)

    Args:
        project_name: 프로젝트명 (없으면 생성)
        method: 'wallacei', 'scipy', 'manual'
        note: 메모
        parameters: {"height": 85.5, "setback": 15.0}
        metrics: {"FAR": (4.8, None), "GFA": (125000, "sqft")}

    Returns:
        {"project_id": ..., "run_id": ..., "params_count": ..., "metrics_count": ...}

    Example (GHPython):
        result = save_design_option(
            project_name="531 W College Street",
            method="wallacei",
            note="Option A - Max FAR",
            parameters={
                "height": height_slider,
                "setback_north": setback_n,
                "setback_south": setback_s,
                "floor_count": floors
            },
            metrics={
                "FAR": (far_value, None),
                "GFA": (gfa_value, "sqft"),
                "SunScore": (sun_score, "%")
            }
        )
    """
    # 1. 프로젝트 찾기 또는 생성
    project = get_project_by_name(project_name)
    if not project:
        project = create_project(project_name)

    # 2. Design Run 생성
    run = create_run(project["id"], method, note)

    # 3. Parameters 저장
    saved_params = save_parameters(run["id"], parameters)

    # 4. Metrics 저장
    saved_metrics = save_metrics(run["id"], metrics)

    return {
        "project_id": project["id"],
        "run_id": run["id"],
        "params_count": len(saved_params),
        "metrics_count": len(saved_metrics)
    }


def get_all_options_for_project(project_name: str) -> List[Dict]:
    """프로젝트의 모든 디자인 옵션 조회

    Returns:
        [
            {
                "run_id": ...,
                "method": "wallacei",
                "note": "...",
                "created_at": "...",
                "parameters": {"height": 85.5, ...},
                "metrics": {"FAR": 4.8, ...}
            },
            ...
        ]
    """
    project = get_project_by_name(project_name)
    if not project:
        return []

    runs = get_runs_by_project(project["id"])
    results = []

    for run in runs:
        params = get_parameters_by_run(run["id"])
        metrics = get_metrics_by_run(run["id"])

        results.append({
            "run_id": run["id"],
            "method": run["method"],
            "note": run["note"],
            "created_at": run["created_at"],
            "parameters": {p["name"]: p["value_numeric"] for p in params},
            "metrics": {m["name"]: m["value"] for m in metrics}
        })

    return results


# ============================================================
# GHPython 예제 코드
# ============================================================
"""
===== GHPython Component: 데이터 저장 =====

# Input:
#   project_name (str): 프로젝트명
#   height (float): 높이
#   setback (float): 셋백
#   far (float): FAR 값
#   gfa (float): GFA 값
#   save (bool): 저장 트리거 (Button)

import sys
sys.path.append(r"C:/Users/dsuk.TSGARCH/OneDrive - Steinberg Hart/Desktop/Source/RhinoScripts/src/gh")

from supabase_connector import save_design_option

if save:
    result = save_design_option(
        project_name=project_name,
        method="manual",
        note="GH에서 저장",
        parameters={
            "height": height,
            "setback": setback
        },
        metrics={
            "FAR": (far, None),
            "GFA": (gfa, "sqft")
        }
    )
    print(f"저장 완료! Run ID: {result['run_id']}")


===== GHPython Component: 데이터 조회 =====

# Input:
#   project_name (str): 프로젝트명

import sys
sys.path.append(r"C:/Users/dsuk.TSGARCH/OneDrive - Steinberg Hart/Desktop/Source/RhinoScripts/src/gh")

from supabase_connector import get_all_options_for_project

options = get_all_options_for_project(project_name)

for opt in options:
    print(f"Method: {opt['method']}")
    print(f"Params: {opt['parameters']}")
    print(f"Metrics: {opt['metrics']}")
    print("---")
"""


# ============================================================
# Test (when run directly)
# ============================================================
if __name__ == "__main__":
    print("=== Supabase Connection Test ===")

    # Project list
    projects = get_projects()
    print(f"\nProjects: {len(projects)}")
    for p in projects:
        print(f"  - {p['name']}")

    # Options for first project
    if projects:
        options = get_all_options_for_project(projects[0]["name"])
        print(f"\n'{projects[0]['name']}' options: {len(options)}")
        for opt in options:
            print(f"  Method: {opt['method']}, Metrics: {opt['metrics']}")
