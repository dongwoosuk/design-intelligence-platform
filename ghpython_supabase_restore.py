"""
GHPython Component: Supabase 옵션에서 파라미터 값 추출
Rhino 8 CPython 전용 (v3.0 - Individual Outputs)

@input: option_index, options
@output: info, params, height, setback_north, setback_south, setback_east, setback_west, floor_count

option_index (int): 복원할 옵션 인덱스 (0부터 시작)
options (list): Load 컴포넌트에서 받은 옵션 목록

=== 출력 ===
info (str): 상태 메시지
params (dict): 전체 파라미터 딕셔너리
height (float): 건물 높이
setback_north (float): 북측 셋백
setback_south (float): 남측 셋백
setback_east (float): 동측 셋백
setback_west (float): 서측 셋백
floor_count (int): 층수

사용법:
1. Load 컴포넌트의 options 출력을 이 컴포넌트에 연결
2. 원하는 옵션 인덱스 설정
3. 각 output을 해당 슬라이더에 수동 연결

Version: 3.0
Date: 2025-12-26
"""

# ============================================================
# 출력 변수 초기화
# ============================================================
info = ""
params = {}
height = None
setback_north = None
setback_south = None
setback_east = None
setback_west = None
floor_count = None

# ============================================================
# Input 변수 기본값 설정
# ============================================================
try:
    option_index
except NameError:
    option_index = 0

try:
    options
except NameError:
    options = None

# ============================================================
# 헬퍼 함수
# ============================================================

def convert_to_python_dict(obj):
    """Convert .NET Dictionary or similar to Python dict"""
    if obj is None:
        return None

    # Python dict
    if isinstance(obj, dict):
        return obj

    # .NET Dictionary (check for Keys property)
    if hasattr(obj, 'Keys'):
        try:
            return {str(k): obj[k] for k in obj.Keys}
        except:
            pass

    # .NET IDictionary
    if hasattr(obj, 'GetEnumerator'):
        try:
            result = {}
            for item in obj:
                if hasattr(item, 'Key') and hasattr(item, 'Value'):
                    result[str(item.Key)] = item.Value
            if result:
                return result
        except:
            pass

    return None


def get_options_list(options):
    """Convert options input to Python list of dicts"""
    if options is None:
        return []

    # If it's already a single Python dict, wrap in list
    if isinstance(options, dict):
        return [options]

    # If it's a single .NET Dictionary
    if hasattr(options, 'Keys'):
        converted = convert_to_python_dict(options)
        return [converted] if converted else []

    # If it's a list or iterable
    result_list = []
    try:
        items = list(options) if not isinstance(options, list) else options
    except:
        return []

    # Filter only dictionaries (skip strings and other types)
    for o in items:
        if isinstance(o, dict):
            result_list.append(o)
        else:
            converted = convert_to_python_dict(o)
            if converted is not None:
                result_list.append(converted)

    return result_list


# ============================================================
# 메인 로직
# ============================================================

try:
    # Convert options to Python list
    options_list = get_options_list(options)

    if not options_list:
        info = "options를 연결하세요 (Load 컴포넌트)"
    else:
        # Ensure option_index is an integer
        idx = int(option_index) if option_index is not None else 0

        # Handle index bounds
        if len(options_list) == 1:
            idx = 0
        elif idx < 0 or idx >= len(options_list):
            idx = 0

        # Get selected option
        selected = options_list[idx]

        if not isinstance(selected, dict):
            info = f"옵션 형식이 올바르지 않습니다 (got {type(selected).__name__})"
        else:
            # Get params from option
            params = selected.get("params", {})

            # Convert params if it's .NET Dictionary
            if params and not isinstance(params, dict):
                params = convert_to_python_dict(params) or {}

            # If no params key, try to extract numeric values directly
            if not params:
                params = {k: v for k, v in selected.items()
                          if isinstance(v, (int, float)) and k not in ['is_selected']}

            # Extract individual parameters
            height = params.get("height")
            setback_north = params.get("setback_north")
            setback_south = params.get("setback_south")
            setback_east = params.get("setback_east")
            setback_west = params.get("setback_west")
            floor_count = params.get("floor_count")

            # Build info message
            note = selected.get("note", "")
            method = selected.get("method", "")
            source = selected.get("source", "")

            param_list = []
            if height is not None:
                param_list.append(f"height={height}")
            if setback_north is not None:
                param_list.append(f"setback_n={setback_north}")
            if setback_south is not None:
                param_list.append(f"setback_s={setback_south}")
            if setback_east is not None:
                param_list.append(f"setback_e={setback_east}")
            if setback_west is not None:
                param_list.append(f"setback_w={setback_west}")
            if floor_count is not None:
                param_list.append(f"floors={floor_count}")

            if param_list:
                info = f"Option #{idx} [{source}] {method}\n{', '.join(param_list)}"
                if note:
                    info += f"\n{note}"
            else:
                info = f"Option #{idx}: 파라미터 없음\n전체 키: {list(selected.keys())}"

except Exception as e:
    info = f"Error: {str(e)}"
    params = {}

print(info)
