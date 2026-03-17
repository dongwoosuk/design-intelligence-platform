"""
Rhino.Inside.Revit: Revit 프로젝트 데이터 → Supabase 업로드
Revit 2022+ / Rhino.Inside.Revit 전용

@input: extract, upload, include_3d
@output: result, project_data, run_id

=== 입력 ===
extract (bool): 데이터 추출 버튼
upload (bool): Supabase 업로드 버튼
include_3d (bool): 3D 지오메트리 포함 여부

=== 출력 ===
result (str): 결과 메시지
project_data (dict): 추출된 프로젝트 데이터
run_id (str): 생성된 Run ID (업로드 시)

=== 사용법 ===
1. Revit에서 Rhino.Inside.Revit 실행
2. Grasshopper 열기
3. 이 스크립트를 GHPython 컴포넌트에 붙여넣기
4. extract 버튼으로 데이터 확인
5. upload 버튼으로 Supabase에 저장
"""

import clr
import System
import json
import os
import tempfile

# Revit API
clr.AddReference('RevitAPI')
clr.AddReference('RevitAPIUI')
from Autodesk.Revit.DB import *

# RhinoInside
import RhinoInside
from RhinoInside.Revit import Revit
import Rhino
import Rhino.FileIO as FileIO

# Python
import requests
import hashlib

# ============================================================
# SUPABASE 설정 - config.py에서 불러오기
# ============================================================
try:
    from config import SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET
except ImportError:
    print("WARNING: config.py not found. Please copy config.example.py to config.py")
    SUPABASE_URL = ""
    SUPABASE_KEY = ""
    STORAGE_BUCKET = "design-assets"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# ============================================================
# Revit 데이터 추출 함수
# ============================================================

def get_revit_document():
    """현재 Revit 문서 가져오기"""
    return Revit.ActiveDBDocument

def extract_project_info(doc):
    """Revit Project Information 추출"""
    info = doc.ProjectInformation

    return {
        "name": info.Name or doc.Title.replace(".rvt", ""),
        "project_number": info.Number or "",
        "address": info.Address or "",
        "client": info.ClientName or "",
        "status": info.Status or "",
        "issue_date": info.IssueDate or "",
    }

def extract_areas(doc):
    """면적 데이터 추출 (Area Schedules)"""
    areas = {
        "gross_area": 0,
        "net_area": 0,
        "site_area": 0,
    }

    # Area 요소 수집
    collector = FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Areas).WhereElementIsNotElementType()

    for area in collector:
        area_value = area.get_Parameter(BuiltInParameter.ROOM_AREA).AsDouble()
        area_sqft = area_value  # Revit 내부 단위는 sqft

        # Area Scheme 확인
        scheme_name = ""
        try:
            scheme_id = area.get_Parameter(BuiltInParameter.AREA_SCHEME_ID).AsElementId()
            scheme = doc.GetElement(scheme_id)
            if scheme:
                scheme_name = scheme.Name.lower()
        except (AttributeError, TypeError):
            pass

        if "gross" in scheme_name:
            areas["gross_area"] += area_sqft
        elif "rentable" in scheme_name or "net" in scheme_name:
            areas["net_area"] += area_sqft
        else:
            areas["gross_area"] += area_sqft

    return areas

def extract_levels(doc):
    """층 정보 추출"""
    collector = FilteredElementCollector(doc).OfClass(Level).WhereElementIsNotElementType()
    levels = list(collector)

    if not levels:
        return {"floor_count": 0, "building_height": 0}

    elevations = [l.Elevation for l in levels]
    min_elev = min(elevations)
    max_elev = max(elevations)

    # 지상층만 카운트 (elevation >= 0)
    above_ground = [l for l in levels if l.Elevation >= -1]

    return {
        "floor_count": len(above_ground),
        "building_height": max_elev - min_elev,  # feet
        "levels": [{"name": l.Name, "elevation": l.Elevation} for l in sorted(levels, key=lambda x: x.Elevation)]
    }

def extract_rooms(doc):
    """Room 데이터로 유닛 정보 추출"""
    collector = FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Rooms).WhereElementIsNotElementType()

    unit_mix = {}
    total_units = 0

    for room in collector:
        if room.Area <= 0:
            continue

        room_name = room.get_Parameter(BuiltInParameter.ROOM_NAME).AsString() or ""
        room_name_lower = room_name.lower()

        # 유닛 타입 분류
        unit_type = None
        if "studio" in room_name_lower or "0br" in room_name_lower:
            unit_type = "studio"
        elif "1br" in room_name_lower or "1 br" in room_name_lower or "1-br" in room_name_lower:
            unit_type = "1br"
        elif "2br" in room_name_lower or "2 br" in room_name_lower or "2-br" in room_name_lower:
            unit_type = "2br"
        elif "3br" in room_name_lower or "3 br" in room_name_lower or "3-br" in room_name_lower:
            unit_type = "3br"
        elif "unit" in room_name_lower or "apt" in room_name_lower:
            unit_type = "unit"

        if unit_type:
            unit_mix[unit_type] = unit_mix.get(unit_type, 0) + 1
            total_units += 1

    return {
        "unit_count": total_units,
        "unit_mix": unit_mix
    }

def extract_parking(doc):
    """주차 대수 추출"""
    collector = FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Parking).WhereElementIsNotElementType()
    return {"parking_count": len(list(collector))}

def calculate_metrics(areas, levels, site_area=None):
    """성능 지표 계산"""
    gross = areas.get("gross_area", 0)
    site = site_area or areas.get("site_area", 0)

    far = gross / site if site > 0 else 0
    efficiency = areas.get("net_area", 0) / gross if gross > 0 else 0

    return {
        "far_actual": round(far, 2),
        "efficiency_ratio": round(efficiency * 100, 1),
    }

# ============================================================
# 3D 지오메트리 추출
# ============================================================

def extract_3d_geometry(doc, view_name=None):
    """Revit 3D 뷰를 Rhino 지오메트리로 변환"""
    try:
        # 3D 뷰 찾기
        collector = FilteredElementCollector(doc).OfClass(View3D).WhereElementIsNotElementType()
        view3d = None

        for v in collector:
            if not v.IsTemplate:
                if view_name and view_name in v.Name:
                    view3d = v
                    break
                elif not view3d:
                    view3d = v

        if not view3d:
            return None, "3D 뷰를 찾을 수 없습니다"

        # 보이는 요소 수집
        visible_collector = FilteredElementCollector(doc, view3d.Id)
        visible_collector.WhereElementIsNotElementType()

        # 건물 매스 관련 카테고리
        categories = [
            BuiltInCategory.OST_Walls,
            BuiltInCategory.OST_Floors,
            BuiltInCategory.OST_Roofs,
            BuiltInCategory.OST_Mass,
        ]

        geometries = []

        for cat in categories:
            cat_collector = FilteredElementCollector(doc, view3d.Id).OfCategory(cat).WhereElementIsNotElementType()

            for elem in cat_collector:
                try:
                    # GeometryElement 가져오기
                    opt = Options()
                    opt.View = view3d
                    opt.ComputeReferences = False

                    geom = elem.get_Geometry(opt)
                    if geom:
                        for geo_obj in geom:
                            # Solid로 변환
                            if isinstance(geo_obj, Solid) and geo_obj.Volume > 0:
                                # Revit Solid → Rhino Brep (RhinoInside 변환)
                                rhino_brep = RhinoInside.Revit.Convert.Geometry.GeometryDecoder.ToBrep(geo_obj)
                                if rhino_brep:
                                    geometries.append(rhino_brep)
                except Exception:
                    continue

        return geometries, f"{len(geometries)}개 지오메트리 추출됨"

    except Exception as e:
        return None, f"3D 추출 오류: {str(e)}"

def save_geometry_to_3dm(geometries):
    """지오메트리를 3dm 파일로 저장"""
    if not geometries:
        return None

    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"rir_geometry_{os.getpid()}.3dm")

    file3dm = FileIO.File3dm()

    for geo in geometries:
        if isinstance(geo, Rhino.Geometry.Brep):
            file3dm.Objects.AddBrep(geo)
        elif isinstance(geo, Rhino.Geometry.Mesh):
            file3dm.Objects.AddMesh(geo)

    file3dm.Write(temp_path, 8)
    return temp_path

# ============================================================
# Supabase 업로드
# ============================================================

def upload_to_storage(file_path, storage_path):
    """파일을 Supabase Storage에 업로드"""
    with open(file_path, 'rb') as f:
        file_data = f.read()

    url = f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{storage_path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }

    files = {'file': (storage_path.split('/')[-1], file_data, 'application/octet-stream')}
    resp = requests.post(url, headers=headers, files=files)

    if resp.status_code in [200, 201]:
        return f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{storage_path}"
    return None

def upload_to_supabase(project_data, geometry_path=None):
    """프로젝트 데이터를 Supabase에 업로드"""

    # 1. 프로젝트 찾기 또는 생성
    project_name = project_data["project_info"]["name"]

    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/projects?name=eq.{project_name}",
        headers=HEADERS
    )
    projects = resp.json()

    if projects:
        project_id = projects[0]["id"]
        # 기존 프로젝트 업데이트
        update_data = {
            "phase": "completed",
            "project_number": project_data["project_info"].get("project_number"),
            "location": project_data["project_info"].get("address"),
            "site_area": project_data["areas"].get("site_area"),
        }
        update_data = {k: v for k, v in update_data.items() if v}

        if update_data:
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}",
                headers=HEADERS,
                json=update_data
            )
    else:
        # 새 프로젝트 생성
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/projects",
            headers=HEADERS,
            json={
                "name": project_name,
                "phase": "completed",
                "project_type": "internal",
                "project_number": project_data["project_info"].get("project_number"),
                "location": project_data["project_info"].get("address"),
                "site_area": project_data["areas"].get("site_area"),
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
        "note": f"Revit에서 추출 ({project_data['project_info'].get('issue_date', '')})",
        # 면적/건물 데이터
        "gross_area": project_data["areas"].get("gross_area"),
        "net_area": project_data["areas"].get("net_area"),
        "far_actual": project_data["metrics"].get("far_actual"),
        "floor_count": project_data["levels"].get("floor_count"),
        "building_height": project_data["levels"].get("building_height"),
        "unit_count": project_data["rooms"].get("unit_count"),
        "unit_mix": project_data["rooms"].get("unit_mix"),
        "parking_count": project_data["parking"].get("parking_count"),
    }
    run_data = {k: v for k, v in run_data.items() if v is not None}

    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/design_runs",
        headers=HEADERS,
        json=run_data
    )
    resp.raise_for_status()
    data = resp.json()
    if not data:
        raise ValueError("Empty response creating design_run")
    run_id = data[0]["id"]

    # 3. 3D 파일 업로드
    geometry_url = None
    if geometry_path and os.path.exists(geometry_path):
        storage_path = f"{project_id}/{run_id}/geometry.3dm"
        geometry_url = upload_to_storage(geometry_path, storage_path)

        if geometry_url:
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/design_runs?id=eq.{run_id}",
                headers=HEADERS,
                json={"geometry_url": geometry_url}
            )

        os.remove(geometry_path)

    return run_id, geometry_url

# ============================================================
# 메인 로직
# ============================================================

result = ""
project_data = {}
run_id = ""

# Input 기본값
try:
    extract
except NameError:
    extract = False

try:
    upload
except NameError:
    upload = False

try:
    include_3d
except NameError:
    include_3d = False

if extract or upload:
    try:
        doc = get_revit_document()

        if not doc:
            result = "Revit 문서를 찾을 수 없습니다"
        else:
            # 데이터 추출
            project_info = extract_project_info(doc)
            areas = extract_areas(doc)
            levels = extract_levels(doc)
            rooms = extract_rooms(doc)
            parking = extract_parking(doc)
            metrics = calculate_metrics(areas, levels)

            project_data = {
                "project_info": project_info,
                "areas": areas,
                "levels": levels,
                "rooms": rooms,
                "parking": parking,
                "metrics": metrics,
            }

            # 결과 출력
            result = f"""
=== {project_info['name']} ===
Project #: {project_info.get('project_number', '-')}
Address: {project_info.get('address', '-')}

=== Areas ===
Gross Area: {areas['gross_area']:,.0f} sqft
Net Area: {areas['net_area']:,.0f} sqft

=== Building ===
Floors: {levels['floor_count']}
Height: {levels['building_height']:.1f} ft

=== Units ===
Total: {rooms['unit_count']}
Mix: {rooms['unit_mix']}

=== Parking ===
Spaces: {parking['parking_count']}

=== Metrics ===
FAR: {metrics['far_actual']}
Efficiency: {metrics['efficiency_ratio']}%
"""

            # 업로드
            if upload:
                geometry_path = None

                if include_3d:
                    geometries, geo_msg = extract_3d_geometry(doc)
                    result += f"\n3D: {geo_msg}"

                    if geometries:
                        geometry_path = save_geometry_to_3dm(geometries)

                run_id, geo_url = upload_to_supabase(project_data, geometry_path)

                result += f"\n\n=== Uploaded ===\nRun ID: {run_id}"
                if geo_url:
                    result += f"\nGeometry: {geo_url}"

    except Exception as e:
        result = f"Error: {str(e)}"

else:
    result = "Extract 버튼을 눌러 데이터를 확인하세요"

print(result)
