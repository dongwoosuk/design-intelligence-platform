# SciPy Optimizer — Grasshopper Usage Guide

## Connection Diagram

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

## Step-by-Step Setup

### 1. Prepare Parameters
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

### 2. Objective Function
The optimizer **minimizes** the objective. To maximize, negate the value.

```python
# Maximize efficiency → negate
objective = -efficiency

# Minimize cost → use as-is
objective = cost

# Multi-objective → weighted sum
objective = 0.5 * (-efficiency) + 0.3 * cost + 0.2 * (-views)
```

### 3. Component Wiring
```
param_names   ─────▶ [SciPy Optimizer] ─────▶ status
param_values  ─────▶                   ─────▶ best_params
param_bounds  ─────▶                   ─────▶ best_objective
objective     ─────▶                   ─────▶ iteration
run (toggle)  ─────▶                   ─────▶ history
project_id    ─────▶                   ─────▶ param_updates
```

### 4. Feedback Loop Control with Data Dam
```
param_updates ─▶ [Data Dam] ─▶ back to sliders

Double-click Data Dam to manually trigger an update,
or use a Timer component for automatic updates.
```

## Example: Massing Optimization

```
INPUTS:
- setback (0–10m)
- floor_count (5–20)
- far_ratio (2.0–5.0)

OBJECTIVE (minimize):
- penalty_far = |target_far - actual_far| * 1000
- penalty_efficiency = (1 - efficiency) * 500
- objective = penalty_far + penalty_efficiency

Result: Hit FAR target while maximizing efficiency
```

## Supabase Storage Format

Optimization results are saved as follows:

```sql
-- design_runs table
{
  "project_id": "xxx",
  "method": "scipy",
  "source": "grasshopper",
  "purpose": "optimization",
  "is_selected": true,  -- true for the optimal solution only
  "note": "SciPy Optimization - Iteration 47 [BEST]"
}

-- design_parameters table
{
  "run_id": "yyy",
  "name": "setback",
  "value_numeric": 3.5
}

-- design_metrics table
{
  "run_id": "yyy",
  "name": "objective",
  "value": 0.0234
}
```

## Tips

1. **Starting point matters** — initial slider values should be within a reasonable range
2. **Set bounds** — prevent physically impossible values (e.g., negative floor count)
3. **Tune `tolerance`** — use 0.01 for fast results, 0.0001 for precision
4. **`max_iter`** — use 200+ for complex problems, 50 for simple ones
5. **`save_all=False`** — save only the final result to reduce DB usage

## Wallacei vs SciPy Optimizer

| Feature | Wallacei | SciPy Optimizer |
|---------|----------|-----------------|
| Multi-objective | ✅ Pareto Front | ❌ Weighted sum required |
| Speed | Slow (evolutionary) | Fast (gradient-free) |
| Visualization | ✅ Built-in | ❌ Manual implementation |
| Simple optimization | Overkill | ✅ Well-suited |
| Supabase integration | ❌ CSV export only | ✅ Direct save |
