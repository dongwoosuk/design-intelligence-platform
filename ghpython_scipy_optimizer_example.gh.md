# SciPy Optimizer - Grasshopper 사용법

## 기본 연결 구조

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Sliders       │────▶│   Your Logic    │────▶│   Objective     │
│   (parameters)  │     │   (GH Script)   │     │   (minimize)    │
└────────┬────────┘     └─────────────────┘     └────────┬────────┘
         │                                               │
         │              ┌─────────────────┐              │
         │              │                 │              │
         └──────────────│   SciPy         │◀─────────────┘
           param_updates│   Optimizer     │  objective
                        │                 │
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │   Data Dam      │
                        │   (flow control)│
                        └────────┬────────┘
                                 │
                        back to sliders
```

## Step-by-Step 설정

### 1. 파라미터 준비
```
Number Slider (setback)     ─┐
Number Slider (floor_count) ─┼─▶ Merge ─▶ param_values
Number Slider (unit_depth)  ─┘

Panel ("setback")           ─┐
Panel ("floor_count")       ─┼─▶ Merge ─▶ param_names
Panel ("unit_depth")        ─┘

Panel ("0,10")              ─┐
Panel ("5,20")              ─┼─▶ Merge ─▶ param_bounds (as tuples)
Panel ("6,12")              ─┘
```

### 2. 목적함수 (Objective)
최적화는 **최소화**합니다. 최대화하려면 음수로 변환하세요.

```python
# 예: 효율성 최대화 → 음수로 변환
objective = -efficiency

# 예: 비용 최소화 → 그대로 사용
objective = cost

# 예: 다중 목적 → 가중합
objective = 0.5 * (-efficiency) + 0.3 * cost + 0.2 * (-views)
```

### 3. 컴포넌트 연결
```
param_names   ─────▶ [SciPy Optimizer] ─────▶ status
param_values  ─────▶                   ─────▶ best_params
param_bounds  ─────▶                   ─────▶ best_objective
objective     ─────▶                   ─────▶ iteration
run (toggle)  ─────▶                   ─────▶ history
project_id    ─────▶                   ─────▶ param_updates
```

### 4. Data Dam으로 피드백 루프 제어
```
param_updates ─▶ [Data Dam] ─▶ back to sliders

Data Dam 더블클릭으로 수동 업데이트
또는 Timer 컴포넌트로 자동 업데이트
```

## 예제: 매싱 최적화

```
INPUTS:
- setback (0-10m)
- floor_count (5-20)
- far_ratio (2.0-5.0)

OBJECTIVE (minimize):
- penalty_far = |target_far - actual_far| * 1000
- penalty_efficiency = (1 - efficiency) * 500
- objective = penalty_far + penalty_efficiency

결과: FAR 목표 달성 + 효율성 최대화
```

## Supabase 저장 형식

최적화 결과는 다음과 같이 저장됩니다:

```sql
-- design_runs 테이블
{
  "project_id": "xxx",
  "method": "scipy",
  "source": "grasshopper",
  "purpose": "optimization",
  "is_selected": true,  -- 최적해만 true
  "note": "SciPy Optimization - Iteration 47 [BEST]"
}

-- design_parameters 테이블
{
  "run_id": "yyy",
  "name": "setback",
  "value_numeric": 3.5
}

-- design_metrics 테이블
{
  "run_id": "yyy",
  "name": "objective",
  "value": 0.0234
}
```

## 팁

1. **시작점 중요**: 초기 슬라이더 값이 합리적인 범위 내에 있어야 함
2. **Bounds 설정**: 물리적으로 불가능한 값 방지 (음수 층수 등)
3. **tolerance 조정**: 빠른 결과 → 0.01, 정밀한 결과 → 0.0001
4. **max_iter**: 복잡한 문제 → 200+, 간단한 문제 → 50
5. **save_all=False**: 최종 결과만 저장 (DB 절약)

## Wallacei vs SciPy

| 기능 | Wallacei | SciPy Optimizer |
|------|----------|-----------------|
| 다중 목적 | ✅ Pareto Front | ❌ 가중합 필요 |
| 속도 | 느림 (진화 알고리즘) | 빠름 (gradient-free) |
| 시각화 | ✅ 내장 | ❌ 직접 구현 |
| 간단한 최적화 | 과함 | ✅ 적합 |
| Supabase 연동 | ❌ CSV export | ✅ 직접 저장 |
