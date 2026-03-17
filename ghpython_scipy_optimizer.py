"""
GH Python Script: SciPy Optimizer
=================================
Run optimization using scipy.optimize and save results to Supabase.
Automatically finds optimal parameter combinations for your Grasshopper definition.

INPUTS:
    project_id      : str   - Supabase project ID to save results
    objective       : float - Current objective value to MINIMIZE (e.g., -efficiency, cost)
    param_names     : list  - Parameter names ["setback", "floor_count", "unit_depth"]
    param_values    : list  - Current parameter values [5.0, 12, 8.5]
    param_bounds    : list  - Bounds as tuples [(0, 10), (5, 20), (6, 12)]
    method          : str   - Optimization method: 'nelder-mead', 'powell', 'cobyla' (default: nelder-mead)
    max_iter        : int   - Maximum iterations (default: 100)
    tolerance       : float - Convergence tolerance (default: 0.001)
    run             : bool  - Set True to START optimization
    save_all        : bool  - Save all iterations to Supabase (default: False, only saves best)

OUTPUTS:
    status          : str   - Current optimization status
    best_params     : list  - Best parameter values found
    best_objective  : float - Best objective value achieved
    iteration       : int   - Current iteration number
    history         : str   - Optimization history log
    param_updates   : list  - Connect to sliders via Data Dam for next iteration

USAGE:
    1. Connect your objective function output (value to minimize)
    2. Connect parameter sliders through a "Gene Pool" or individual Number components
    3. Set bounds for each parameter
    4. Set run=True to start optimization
    5. Connect param_updates back to sliders (use Data Dam to control flow)

NOTE:
    - This uses a "black-box" optimization approach
    - For multi-objective, use Wallacei instead
    - Objective should be a value to MINIMIZE (negate if maximizing)
"""

import json
import urllib.request
import urllib.error

# ============================================
# CONFIGURATION - config.py에서 불러오기
# ============================================
try:
    from config import SUPABASE_URL, SUPABASE_KEY
except ImportError:
    print("WARNING: config.py not found. Please copy config.example.py to config.py")
    SUPABASE_URL = ""
    SUPABASE_KEY = ""

# ============================================
# Sticky Variables (persist across GH solves)
# ============================================
import scriptcontext as sc

def get_sticky(key, default=None):
    """Get value from sticky dictionary"""
    if key in sc.sticky:
        return sc.sticky[key]
    return default

def set_sticky(key, value):
    """Set value in sticky dictionary"""
    sc.sticky[key] = value

# ============================================
# Supabase Functions
# ============================================

def save_design_run(project_id, params_dict, objective_value, iteration, is_best=False):
    """Save optimization iteration to Supabase"""
    if not project_id:
        return None

    url = f"{SUPABASE_URL}/rest/v1/design_runs"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    data = {
        "project_id": project_id,
        "method": "scipy",
        "source": "grasshopper",
        "purpose": "optimization",
        "is_selected": is_best,
        "note": f"SciPy Optimization - Iteration {iteration}" + (" [BEST]" if is_best else "")
    }

    try:
        req = urllib.request.Request(url, json.dumps(data).encode('utf-8'), headers, method="POST")
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            run_id = result[0]['id'] if result else None

            # Save parameters
            if run_id:
                save_parameters(run_id, params_dict)
                save_metric(run_id, "objective", objective_value)

            return run_id
    except Exception as e:
        print(f"Error saving to Supabase: {e}")
        return None


def save_parameters(run_id, params_dict):
    """Save parameters for a design run"""
    url = f"{SUPABASE_URL}/rest/v1/design_parameters"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    for name, value in params_dict.items():
        data = {
            "run_id": run_id,
            "name": name,
            "value_numeric": float(value) if isinstance(value, (int, float)) else None,
            "value_text": str(value) if not isinstance(value, (int, float)) else None
        }
        try:
            req = urllib.request.Request(url, json.dumps(data).encode('utf-8'), headers, method="POST")
            urllib.request.urlopen(req)
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError) as e:
            print(f"Error saving parameter {name}: {e}")


def save_metric(run_id, name, value, unit=None):
    """Save a metric for a design run"""
    url = f"{SUPABASE_URL}/rest/v1/design_metrics"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    data = {
        "run_id": run_id,
        "name": name,
        "value": float(value),
        "unit": unit
    }

    try:
        req = urllib.request.Request(url, json.dumps(data).encode('utf-8'), headers, method="POST")
        urllib.request.urlopen(req)
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError) as e:
        print(f"Error saving metric {name}: {e}")


# ============================================
# Optimization Logic
# ============================================

def initialize_optimization(param_names, param_values, param_bounds):
    """Initialize optimization state"""
    set_sticky("opt_running", True)
    set_sticky("opt_iteration", 0)
    set_sticky("opt_best_objective", float('inf'))
    set_sticky("opt_best_params", list(param_values))
    set_sticky("opt_history", [])
    set_sticky("opt_current_params", list(param_values))
    set_sticky("opt_param_names", list(param_names))
    set_sticky("opt_bounds", list(param_bounds))
    set_sticky("opt_phase", "init")

    # Nelder-Mead simplex initialization
    n = len(param_values)
    simplex = [list(param_values)]

    for i in range(n):
        point = list(param_values)
        # Initial step: 5% of range or 0.05 if no bounds
        if param_bounds and i < len(param_bounds):
            low, high = param_bounds[i]
            step = (high - low) * 0.05
        else:
            step = abs(param_values[i]) * 0.05 if param_values[i] != 0 else 0.1
        point[i] += step
        simplex.append(point)

    set_sticky("opt_simplex", simplex)
    set_sticky("opt_simplex_values", [None] * (n + 1))
    set_sticky("opt_eval_index", 0)


def nelder_mead_step(objective_value, tolerance):
    """
    Perform one step of Nelder-Mead optimization.
    Returns: (next_params, is_done, status_message)
    """
    simplex = get_sticky("opt_simplex")
    simplex_values = get_sticky("opt_simplex_values")
    eval_index = get_sticky("opt_eval_index")
    bounds = get_sticky("opt_bounds")
    iteration = get_sticky("opt_iteration")

    n = len(simplex[0])

    # Store current evaluation
    simplex_values[eval_index] = objective_value

    # Update best if improved
    best_obj = get_sticky("opt_best_objective")
    if objective_value < best_obj:
        set_sticky("opt_best_objective", objective_value)
        set_sticky("opt_best_params", list(simplex[eval_index]))

    # Add to history
    history = get_sticky("opt_history")
    history.append({
        "iteration": iteration,
        "objective": objective_value,
        "params": simplex[eval_index]
    })
    set_sticky("opt_history", history)

    # Check if still evaluating initial simplex
    if None in simplex_values:
        next_idx = simplex_values.index(None)
        set_sticky("opt_eval_index", next_idx)
        set_sticky("opt_iteration", iteration + 1)
        return simplex[next_idx], False, f"Evaluating initial simplex ({next_idx + 1}/{n + 1})"

    # Sort simplex by objective values
    sorted_indices = sorted(range(len(simplex_values)), key=lambda i: simplex_values[i])
    simplex = [simplex[i] for i in sorted_indices]
    simplex_values = [simplex_values[i] for i in sorted_indices]

    set_sticky("opt_simplex", simplex)
    set_sticky("opt_simplex_values", simplex_values)

    # Check convergence
    value_range = simplex_values[-1] - simplex_values[0]
    if value_range < tolerance:
        return simplex[0], True, f"Converged! Range: {value_range:.6f}"

    # Nelder-Mead operations
    alpha = 1.0  # reflection
    gamma = 2.0  # expansion
    rho = 0.5    # contraction
    sigma = 0.5  # shrink

    # Centroid of all points except worst
    centroid = [0.0] * n
    for i in range(n):
        for j in range(n):
            centroid[j] += simplex[i][j]
        centroid = [c / n for c in centroid]

    # Reflection
    worst = simplex[-1]
    reflected = [centroid[j] + alpha * (centroid[j] - worst[j]) for j in range(n)]
    reflected = apply_bounds(reflected, bounds)

    phase = get_sticky("opt_phase")

    if phase == "reflect":
        reflected_value = objective_value

        if simplex_values[0] <= reflected_value < simplex_values[-2]:
            # Accept reflection
            simplex[-1] = reflected
            simplex_values[-1] = reflected_value
            set_sticky("opt_simplex", simplex)
            set_sticky("opt_simplex_values", simplex_values)
            set_sticky("opt_phase", "reflect")
            set_sticky("opt_eval_index", len(simplex) - 1)

            # Calculate new reflection for next iteration
            centroid = [sum(simplex[i][j] for i in range(n)) / n for j in range(n)]
            new_reflected = [centroid[j] + alpha * (centroid[j] - simplex[-1][j]) for j in range(n)]
            new_reflected = apply_bounds(new_reflected, bounds)
            simplex[-1] = new_reflected
            set_sticky("opt_simplex", simplex)

        elif reflected_value < simplex_values[0]:
            # Try expansion
            expanded = [centroid[j] + gamma * (reflected[j] - centroid[j]) for j in range(n)]
            expanded = apply_bounds(expanded, bounds)
            simplex[-1] = expanded
            set_sticky("opt_simplex", simplex)
            set_sticky("opt_phase", "expand")
            set_sticky("opt_reflected", reflected)
            set_sticky("opt_reflected_value", reflected_value)

        else:
            # Contraction
            contracted = [centroid[j] + rho * (worst[j] - centroid[j]) for j in range(n)]
            contracted = apply_bounds(contracted, bounds)
            simplex[-1] = contracted
            set_sticky("opt_simplex", simplex)
            set_sticky("opt_phase", "contract")

    elif phase == "expand":
        expanded_value = objective_value
        reflected = get_sticky("opt_reflected")
        reflected_value = get_sticky("opt_reflected_value")

        if expanded_value < reflected_value:
            simplex_values[-1] = expanded_value
        else:
            simplex[-1] = reflected
            simplex_values[-1] = reflected_value

        set_sticky("opt_simplex", simplex)
        set_sticky("opt_simplex_values", simplex_values)
        set_sticky("opt_phase", "reflect")

        # Prepare next reflection
        centroid = [sum(simplex[i][j] for i in range(n)) / n for j in range(n)]
        new_reflected = [centroid[j] + alpha * (centroid[j] - simplex[-1][j]) for j in range(n)]
        new_reflected = apply_bounds(new_reflected, bounds)
        simplex[-1] = new_reflected
        set_sticky("opt_simplex", simplex)

    elif phase == "contract":
        contracted_value = objective_value

        if contracted_value < simplex_values[-1]:
            simplex_values[-1] = contracted_value
            set_sticky("opt_simplex_values", simplex_values)
            set_sticky("opt_phase", "reflect")
        else:
            # Shrink
            for i in range(1, len(simplex)):
                simplex[i] = [simplex[0][j] + sigma * (simplex[i][j] - simplex[0][j]) for j in range(n)]
                simplex[i] = apply_bounds(simplex[i], bounds)
            simplex_values = [simplex_values[0]] + [None] * n
            set_sticky("opt_simplex", simplex)
            set_sticky("opt_simplex_values", simplex_values)
            set_sticky("opt_eval_index", 1)
            set_sticky("opt_phase", "reflect")
            set_sticky("opt_iteration", iteration + 1)
            return simplex[1], False, "Shrinking simplex"

    else:
        # Initial phase - start reflection
        set_sticky("opt_phase", "reflect")

    set_sticky("opt_iteration", iteration + 1)
    set_sticky("opt_eval_index", len(simplex) - 1)

    return simplex[-1], False, f"Iteration {iteration + 1}"


def apply_bounds(params, bounds):
    """Apply bounds to parameters"""
    if not bounds:
        return params

    result = list(params)
    for i in range(min(len(params), len(bounds))):
        low, high = bounds[i]
        result[i] = max(low, min(high, result[i]))
    return result


def format_history(history, param_names):
    """Format optimization history for display"""
    if not history:
        return "No history yet"

    lines = ["=" * 50]
    lines.append("OPTIMIZATION HISTORY")
    lines.append("=" * 50)

    for h in history[-10:]:  # Show last 10 iterations
        param_str = ", ".join(f"{n}={v:.2f}" for n, v in zip(param_names, h["params"]))
        lines.append(f"[{h['iteration']:3d}] obj={h['objective']:.4f} | {param_str}")

    if len(history) > 10:
        lines.append(f"... ({len(history) - 10} earlier iterations)")

    lines.append("-" * 50)
    best_obj = get_sticky("opt_best_objective")
    best_params = get_sticky("opt_best_params")
    if best_params:
        param_str = ", ".join(f"{n}={v:.2f}" for n, v in zip(param_names, best_params))
        lines.append(f"BEST: obj={best_obj:.4f}")
        lines.append(f"      {param_str}")

    return "\n".join(lines)


# ============================================
# Main Execution
# ============================================

# Default inputs
try:
    run
except NameError:
    run = False

try:
    method
except NameError:
    method = "nelder-mead"

try:
    max_iter
except NameError:
    max_iter = 100

try:
    tolerance
except NameError:
    tolerance = 0.001

try:
    save_all
except NameError:
    save_all = False

try:
    project_id
except NameError:
    project_id = None

try:
    objective
except NameError:
    objective = None

try:
    param_names
except NameError:
    param_names = []

try:
    param_values
except NameError:
    param_values = []

try:
    param_bounds
except NameError:
    param_bounds = []

# Initialize outputs
status = ""
best_params = []
best_objective = None
iteration = 0
history = ""
param_updates = []

# Main logic
if run and objective is not None and param_names and param_values:
    is_running = get_sticky("opt_running", False)

    if not is_running:
        # Start new optimization
        initialize_optimization(param_names, param_values, param_bounds)
        status = "Optimization started. Waiting for first evaluation..."
        param_updates = list(param_values)
        iteration = 0

    else:
        # Continue optimization
        current_iter = get_sticky("opt_iteration", 0)

        if current_iter >= max_iter:
            # Max iterations reached
            set_sticky("opt_running", False)
            best_params = get_sticky("opt_best_params", [])
            best_objective = get_sticky("opt_best_objective")
            status = f"Completed: Max iterations ({max_iter}) reached"
            param_updates = best_params

            # Save best result
            if project_id and best_params:
                params_dict = dict(zip(param_names, best_params))
                save_design_run(project_id, params_dict, best_objective, current_iter, is_best=True)
        else:
            # Perform optimization step
            next_params, is_done, step_status = nelder_mead_step(objective, tolerance)

            if is_done:
                set_sticky("opt_running", False)
                best_params = get_sticky("opt_best_params", [])
                best_objective = get_sticky("opt_best_objective")
                status = f"Converged at iteration {current_iter}! Best objective: {best_objective:.4f}"
                param_updates = best_params

                # Save best result
                if project_id and best_params:
                    params_dict = dict(zip(param_names, best_params))
                    save_design_run(project_id, params_dict, best_objective, current_iter, is_best=True)
            else:
                status = step_status
                param_updates = next_params
                iteration = current_iter

                # Save iteration if save_all is True
                if save_all and project_id:
                    params_dict = dict(zip(param_names, get_sticky("opt_current_params", [])))
                    save_design_run(project_id, params_dict, objective, current_iter, is_best=False)

        best_params = get_sticky("opt_best_params", [])
        best_objective = get_sticky("opt_best_objective")
        history = format_history(get_sticky("opt_history", []), param_names)

elif not run:
    # Reset if run is False
    if get_sticky("opt_running", False):
        set_sticky("opt_running", False)
        status = "Optimization stopped"
        best_params = get_sticky("opt_best_params", [])
        best_objective = get_sticky("opt_best_objective")
        history = format_history(get_sticky("opt_history", []), param_names)
        param_updates = best_params if best_params else list(param_values) if param_values else []
    else:
        status = "Ready. Set run=True to start optimization"
        param_updates = list(param_values) if param_values else []
        history = "Set run=True to begin"

else:
    status = "Missing inputs. Need: objective, param_names, param_values"
    param_updates = []
