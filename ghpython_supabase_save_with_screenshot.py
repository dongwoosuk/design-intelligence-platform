"""
GHPython Component: Supabase에 디자인 옵션 + 스크린샷 + 지오메트리 저장
Rhino 8 CPython 전용 (v2.0 - Extended Schema)

@input: project_name, height, setback_n, setback_s, setback_e, setback_w, floors, far, gfa, net_area, lot_coverage, unit_count, unit_mix, parking_count, sun_score, source, purpose, note, geometry, save
@output: result, run_id, screenshot_url, geometry_url

=== 기본 입력 ===
project_name (str): 프로젝트명
save (bool): 저장 버튼

=== 건물 파라미터 ===
height (float): 건물 높이 (ft)
floors (int): 층수
setback_n (float): 북측 셋백
setback_s (float): 남측 셋백
setback_e (float): 동측 셋백 (optional)
setback_w (float): 서측 셋백 (optional)

=== 결과값 (Metrics) ===
far (float): FAR 용적률
gfa (float): GFA 연면적 (sqft)
net_area (float): 전용면적 (sqft, optional)
lot_coverage (float): 건폐율 (optional)
unit_count (int): 총 유닛 수 (optional)
unit_mix (dict/str): 유닛 믹스 JSON (optional) - {"studio": 10, "1br": 20, "2br": 15}
parking_count (int): 주차 대수 (optional)
sun_score (float): 일조 점수 (optional)

=== 메타데이터 ===
source (str): 데이터 소스 - 'grasshopper' | 'wallacei' | 'revit' | 'manual' (default: 'grasshopper')
purpose (str): 목적 - 'massing_study' | 'optimization' | 'documentation' | 'as_built' (default: 'massing_study')
note (str): 메모

=== 지오메트리 ===
geometry (Geometry): 저장할 지오메트리 (리스트 가능)

=== 출력 ===
result (str): 결과 메시지
run_id (str): 생성된 Run ID
screenshot_url (str): 스크린샷 URL
geometry_url (str): 지오메트리 URL (.3dm)

사전 설정:
1. Supabase Dashboard → Storage → New bucket → "design-assets" (Public)
2. Bucket policies 설정 (public access)
"""

import requests
import hashlib
import json
import os
import tempfile
import System
import System.Drawing as SD
import Rhino
import Rhino.FileIO as FileIO

# ============================================================
# SUPABASE 설정 - config.py에서 불러오기
# ============================================================
try:
    from config import SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET
except ImportError:
    # config.py가 없으면 기본값 사용
    print("WARNING: config.py not found. Please copy config.example.py to config.py")
    SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
    SUPABASE_KEY = "your-anon-key-here"
    STORAGE_BUCKET = "design-assets"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# ============================================================
# 헬퍼 함수
# ============================================================

# 디버그 로그 저장용
debug_log = []

def capture_viewport():
    """현재 뷰포트를 PNG로 캡처하여 임시 파일 경로 반환"""
    global debug_log
    try:
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, f"gh_screenshot_{os.getpid()}.png")
        debug_log.append(f"temp_path: {temp_path}")

        rhino_doc = Rhino.RhinoDoc.ActiveDoc
        if not rhino_doc:
            debug_log.append("ERROR: RhinoDoc.ActiveDoc is None")
            return None

        view = rhino_doc.Views.ActiveView
        if not view:
            debug_log.append("ERROR: No active view")
            return None

        debug_log.append(f"View: {view.ActiveViewport.Name}")

        view_size = view.Size
        debug_log.append(f"Size: {view_size.Width}x{view_size.Height}")
        bitmap = view.CaptureToBitmap(view_size)

        if bitmap:
            bitmap.Save(temp_path, SD.Imaging.ImageFormat.Png)
            debug_log.append(f"Saved: {os.path.exists(temp_path)}")
            return temp_path
        else:
            debug_log.append("ERROR: CaptureToBitmap returned None")
            return None

    except Exception as e:
        debug_log.append(f"EXCEPTION: {str(e)}")
        return None


def upload_to_storage(file_path, storage_path, content_type="image/png"):
    """파일을 Supabase Storage에 업로드"""
    global debug_log
    try:
        with open(file_path, 'rb') as f:
            file_data = f.read()
        debug_log.append(f"File size: {len(file_data)} bytes")

        url = f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{storage_path}"

        if storage_path.endswith('.3dm'):
            debug_log.append("Using multipart upload for 3dm")
            files = {
                'file': (storage_path.split('/')[-1], file_data, 'application/octet-stream')
            }
            headers = {
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            }
            resp = requests.post(url, headers=headers, files=files)
        else:
            headers = {
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": content_type
            }
            resp = requests.post(url, headers=headers, data=file_data)

        debug_log.append(f"Upload status: {resp.status_code}")

        if resp.status_code in [200, 201]:
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{storage_path}"
            return public_url
        else:
            debug_log.append(f"Upload error: {resp.text[:200]}")
            return None

    except Exception as e:
        debug_log.append(f"Upload exception: {str(e)}")
        return None


def save_geometry_to_3dm(geometry_list):
    """지오메트리를 .3dm 파일로 저장하여 임시 파일 경로 반환"""
    global debug_log
    try:
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, f"gh_geometry_{os.getpid()}.3dm")
        debug_log.append(f"3dm temp_path: {temp_path}")

        file3dm = FileIO.File3dm()

        if geometry_list is None:
            debug_log.append("No geometry provided")
            return None

        if hasattr(geometry_list, '__iter__') and not isinstance(geometry_list, str):
            geo_items = list(geometry_list)
        else:
            geo_items = [geometry_list]

        debug_log.append(f"geo_items count: {len(geo_items)}")

        count = 0
        rhino_doc = Rhino.RhinoDoc.ActiveDoc

        for geo in geo_items:
            if geo is None:
                continue

            try:
                geo_type = type(geo).__name__
                debug_log.append(f"geo type: {geo_type}")

                if geo_type == "Guid" or "Guid" in str(type(geo)):
                    debug_log.append("Attempting GUID resolution...")
                    try:
                        if not isinstance(geo, System.Guid):
                            geo = System.Guid(str(geo))

                        rhino_obj = rhino_doc.Objects.FindId(geo)
                        if rhino_obj is None:
                            rhino_obj = rhino_doc.Objects.Find(geo)

                        if rhino_obj is not None:
                            geo = rhino_obj.Geometry
                            geo_type = type(geo).__name__
                            debug_log.append(f"Resolved from Rhino doc: {geo_type}")
                        else:
                            debug_log.append(f"GUID object not found: {geo}")
                            continue
                    except Exception as guid_err:
                        debug_log.append(f"GUID resolution error: {str(guid_err)}")
                        continue

                if isinstance(geo, Rhino.Geometry.Brep):
                    file3dm.Objects.AddBrep(geo)
                    count += 1
                elif isinstance(geo, Rhino.Geometry.Mesh):
                    file3dm.Objects.AddMesh(geo)
                    count += 1
                elif isinstance(geo, Rhino.Geometry.Curve):
                    file3dm.Objects.AddCurve(geo)
                    count += 1
                elif isinstance(geo, Rhino.Geometry.Surface):
                    brep = geo.ToBrep()
                    if brep:
                        file3dm.Objects.AddBrep(brep)
                        count += 1
                elif isinstance(geo, Rhino.Geometry.Extrusion):
                    brep = geo.ToBrep()
                    if brep:
                        file3dm.Objects.AddBrep(brep)
                        count += 1
                else:
                    debug_log.append(f"Unsupported type: {geo_type}")
            except Exception as geo_err:
                debug_log.append(f"geo add error: {str(geo_err)}")

        if count == 0:
            debug_log.append("No valid geometry to save")
            return None

        file3dm.Write(temp_path, 8)
        debug_log.append(f"3dm saved: {count} objects")

        return temp_path

    except Exception as e:
        debug_log.append(f"3dm save exception: {str(e)}")
        return None


def safe_float(val, default=None):
    """안전하게 float 변환"""
    try:
        if val is None or val == "":
            return default
        return float(val)
    except (ValueError, TypeError):
        return default


def safe_int(val, default=None):
    """안전하게 int 변환"""
    try:
        if val is None or val == "":
            return default
        return int(val)
    except (ValueError, TypeError):
        return default


def parse_unit_mix(val):
    """unit_mix를 JSON으로 변환"""
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
screenshot_url = ""
geometry_url = ""

# Input 변수 기본값 설정
try:
    save
except NameError:
    save = False

try:
    project_name
except NameError:
    project_name = ""

try:
    note
except NameError:
    note = ""

try:
    geometry
except NameError:
    geometry = None

try:
    source
except NameError:
    source = "grasshopper"

# "all"은 필터용이므로 저장 시 기본값으로 변경
if source == "all" or not source:
    source = "grasshopper"

try:
    purpose
except NameError:
    purpose = "massing_study"

# Optional inputs
try:
    setback_e
except NameError:
    setback_e = None

try:
    setback_w
except NameError:
    setback_w = None

try:
    net_area
except NameError:
    net_area = None

try:
    lot_coverage
except NameError:
    lot_coverage = None

try:
    unit_count
except NameError:
    unit_count = None

try:
    unit_mix
except NameError:
    unit_mix = None

try:
    parking_count
except NameError:
    parking_count = None

try:
    sun_score
except NameError:
    sun_score = None

if save:
    try:
        debug_log = []

        # 0. 중복 체크용 해시 생성
        hash_data = {
            "project": project_name,
            "height": height,
            "setback_n": setback_n,
            "setback_s": setback_s,
            "floors": floors,
            "far": far,
            "gfa": gfa,
            "note": note
        }
        data_hash = hashlib.md5(json.dumps(hash_data, sort_keys=True).encode()).hexdigest()[:16]

        # 1. 프로젝트 찾기 또는 생성
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/projects?name=eq.{project_name}",
            headers=HEADERS
        )
        projects = resp.json()

        if projects:
            project_id = projects[0]["id"]

            # 동일 해시 확인
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/design_runs?project_id=eq.{project_id}&data_hash=eq.{data_hash}&order=created_at.desc&limit=1",
                headers=HEADERS
            )
            existing = resp.json()
            if existing:
                result = f"동일한 데이터가 이미 저장됨 (Run ID: {existing[0]['id'][:8]}...)"
                run_id = existing[0]['id']
                screenshot_url = existing[0].get('screenshot_url', '')
                print(result)
                save = False
        else:
            # 새 프로젝트 생성 (기본값으로 phase='SD' 설정됨)
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/projects",
                headers=HEADERS,
                json={"name": project_name}
            )
            resp.raise_for_status()
            data = resp.json()
            if not data:
                raise ValueError("Empty response creating project")
            project_id = data[0]["id"]

        if save:
            # 2. 스크린샷 캡처
            print("스크린샷 캡처 중...")
            temp_screenshot = capture_viewport()

            # 3. Design Run 생성 (확장된 스키마 사용)
            run_data = {
                "project_id": project_id,
                "method": "manual",
                "note": note if note else "GH에서 저장",
                "data_hash": data_hash,
                # 새 컬럼들
                "source": source or "grasshopper",
                "purpose": purpose or "massing_study",
                # 결과값 (design_runs에 직접 저장)
                "gross_area": safe_float(gfa),
                "net_area": safe_float(net_area),
                "far_actual": safe_float(far),
                "lot_coverage": safe_float(lot_coverage),
                "floor_count": safe_int(floors),
                "building_height": safe_float(height),
                "unit_count": safe_int(unit_count),
                "unit_mix": parse_unit_mix(unit_mix),
                "parking_count": safe_int(parking_count),
            }

            # None 값 제거
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

            # 4. 스크린샷 업로드
            if temp_screenshot and os.path.exists(temp_screenshot):
                storage_path = f"{project_id}/{run_id}/screenshot.png"
                screenshot_url = upload_to_storage(temp_screenshot, storage_path, "image/png")

                if screenshot_url:
                    print(f"스크린샷 저장: {screenshot_url}")

                os.remove(temp_screenshot)

            # 5. 지오메트리 저장
            if geometry is not None:
                print("지오메트리 저장 중...")
                temp_geometry = save_geometry_to_3dm(geometry)

                if temp_geometry and os.path.exists(temp_geometry):
                    storage_path = f"{project_id}/{run_id}/geometry.3dm"
                    geometry_url = upload_to_storage(temp_geometry, storage_path, "model/vnd.3dm")

                    if geometry_url:
                        print(f"지오메트리 저장: {geometry_url}")

                    os.remove(temp_geometry)

            # 6. design_runs 테이블에 URL 저장
            update_data = {}
            if screenshot_url:
                update_data["screenshot_url"] = screenshot_url
            if geometry_url:
                update_data["geometry_url"] = geometry_url
            if update_data:
                requests.patch(
                    f"{SUPABASE_URL}/rest/v1/design_runs?id=eq.{run_id}",
                    headers=HEADERS,
                    json=update_data
                )

            # 7. Parameters 저장 (셋백 등 상세 파라미터)
            params = [
                {"run_id": run_id, "name": "height", "value_numeric": height},
                {"run_id": run_id, "name": "setback_north", "value_numeric": setback_n},
                {"run_id": run_id, "name": "setback_south", "value_numeric": setback_s},
                {"run_id": run_id, "name": "floor_count", "value_numeric": floors},
            ]
            # Optional setbacks
            if setback_e is not None:
                params.append({"run_id": run_id, "name": "setback_east", "value_numeric": setback_e})
            if setback_w is not None:
                params.append({"run_id": run_id, "name": "setback_west", "value_numeric": setback_w})

            requests.post(
                f"{SUPABASE_URL}/rest/v1/design_parameters",
                headers=HEADERS,
                json=params
            )

            # 8. Metrics 저장 (특수 지표)
            metrics = [
                {"run_id": run_id, "name": "FAR", "value": far, "unit": None},
                {"run_id": run_id, "name": "GFA", "value": gfa, "unit": "sqft"},
            ]
            if sun_score is not None:
                metrics.append({"run_id": run_id, "name": "SunScore", "value": sun_score, "unit": "%"})

            requests.post(
                f"{SUPABASE_URL}/rest/v1/design_metrics",
                headers=HEADERS,
                json=metrics
            )

            result = f"저장 완료! Run ID: {run_id[:8]}..."
            result += f"\n  Source: {source}, Purpose: {purpose}"
            if screenshot_url:
                result += f"\n  스크린샷 저장됨"
            if geometry_url:
                result += f"\n  지오메트리 저장됨"
            else:
                result += f"\n  지오메트리 저장 실패: {' | '.join(debug_log[-3:])}"

    except Exception as e:
        result = f"Error: {str(e)}\nDebug: {' | '.join(debug_log)}"
        run_id = ""

else:
    result = "Save 버튼을 눌러 저장하세요"

print(result)
