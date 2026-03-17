"""
GH Python Script: Wallacei Results Importer
============================================
Import Wallacei optimization results (CSV export) into Supabase.
Supports both single CSV and folder batch import.

INPUTS:
    project_id      : str  - Supabase project ID (required)
    csv_path        : str  - Path to Wallacei CSV export file or folder
    gene_names      : list - Names for gene values ["setback", "floor_count", ...]
    fitness_names   : list - Names for fitness objectives ["FAR", "efficiency", ...]
    phenotype_names : list - Names for phenotype values (optional)
    import_pareto   : bool - Only import Pareto front solutions (default: True)
    import_all      : bool - Import all generations (default: False, imports last gen only)
    run_import      : bool - Set True to execute import

OUTPUTS:
    status          : str  - Import status message
    imported_count  : int  - Number of solutions imported
    pareto_count    : int  - Number of Pareto solutions
    summary         : str  - Summary of imported data
    run_ids         : list - List of created design_run IDs

WALLACEI EXPORT FORMAT:
    Wallacei exports CSV with columns:
    - Generation, Individual, Rank, Crowding Distance
    - Gene 0, Gene 1, Gene 2, ... (normalized 0-1 values)
    - Fitness 0, Fitness 1, ... (objective values)
    - Phenotype 0, Phenotype 1, ... (output values, optional)

USAGE:
    1. In Wallacei, export results: Wallacei X > Export > CSV
    2. Connect the CSV file path to this component
    3. Provide gene_names matching your slider names
    4. Provide fitness_names matching your objectives
    5. Set run_import=True to import
"""

import json
import urllib.request
import urllib.error
import os
import csv
from datetime import datetime

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
# CSV Parsing Functions
# ============================================

def parse_wallacei_csv(file_path):
    """
    Parse Wallacei CSV export file.

    Returns:
        dict with keys:
        - generations: list of generation numbers
        - individuals: list of dicts with all data
        - gene_count: number of genes
        - fitness_count: number of fitness objectives
        - phenotype_count: number of phenotypes
    """
    individuals = []
    gene_count = 0
    fitness_count = 0
    phenotype_count = 0

    with open(file_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames

        # Count columns by type
        gene_cols = [h for h in headers if h.startswith('Gene')]
        fitness_cols = [h for h in headers if h.startswith('Fitness')]
        phenotype_cols = [h for h in headers if h.startswith('Phenotype')]

        gene_count = len(gene_cols)
        fitness_count = len(fitness_cols)
        phenotype_count = len(phenotype_cols)

        for row in reader:
            individual = {
                'generation': int(row.get('Generation', 0)),
                'individual': int(row.get('Individual', 0)),
                'rank': int(row.get('Rank', 0)) if row.get('Rank') else None,
                'crowding_distance': float(row.get('Crowding Distance', 0)) if row.get('Crowding Distance') else None,
                'genes': [],
                'fitness': [],
                'phenotypes': []
            }

            # Extract gene values
            for i in range(gene_count):
                col_name = f'Gene {i}'
                if col_name in row and row[col_name]:
                    individual['genes'].append(float(row[col_name]))

            # Extract fitness values
            for i in range(fitness_count):
                col_name = f'Fitness {i}'
                if col_name in row and row[col_name]:
                    individual['fitness'].append(float(row[col_name]))

            # Extract phenotype values
            for i in range(phenotype_count):
                col_name = f'Phenotype {i}'
                if col_name in row and row[col_name]:
                    individual['phenotypes'].append(float(row[col_name]))

            individuals.append(individual)

    return {
        'individuals': individuals,
        'gene_count': gene_count,
        'fitness_count': fitness_count,
        'phenotype_count': phenotype_count,
        'total_count': len(individuals)
    }


def filter_pareto_front(individuals):
    """Filter to only Pareto front solutions (Rank 1)"""
    return [ind for ind in individuals if ind.get('rank') == 1]


def filter_last_generation(individuals):
    """Filter to only last generation"""
    if not individuals:
        return []
    max_gen = max(ind['generation'] for ind in individuals)
    return [ind for ind in individuals if ind['generation'] == max_gen]


def get_csv_files(path):
    """Get all CSV files from path (file or folder)"""
    if os.path.isfile(path):
        return [path] if path.lower().endswith('.csv') else []
    elif os.path.isdir(path):
        return [os.path.join(path, f) for f in os.listdir(path)
                if f.lower().endswith('.csv')]
    return []


# ============================================
# Supabase Functions
# ============================================

def create_design_run(project_id, generation, individual_num, rank, is_pareto, note=""):
    """Create a design run in Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/design_runs"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    data = {
        "project_id": project_id,
        "method": "wallacei",
        "source": "grasshopper",
        "purpose": "optimization",
        "is_selected": is_pareto and rank == 1,
        "note": note or f"Wallacei Gen {generation} Ind {individual_num}" + (" [Pareto]" if is_pareto else "")
    }

    try:
        req = urllib.request.Request(url, json.dumps(data).encode('utf-8'), headers, method="POST")
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result[0]['id'] if result else None
    except Exception as e:
        print(f"Error creating design_run: {e}")
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
        except Exception as e:
            print(f"Error saving parameter {name}: {e}")


def save_metrics(run_id, metrics_dict):
    """Save metrics for a design run"""
    url = f"{SUPABASE_URL}/rest/v1/design_metrics"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    for name, value in metrics_dict.items():
        data = {
            "run_id": run_id,
            "name": name,
            "value": float(value)
        }
        try:
            req = urllib.request.Request(url, json.dumps(data).encode('utf-8'), headers, method="POST")
            urllib.request.urlopen(req)
        except Exception as e:
            print(f"Error saving metric {name}: {e}")


def import_individual(project_id, individual, gene_names, fitness_names, phenotype_names=None):
    """Import a single individual to Supabase"""
    # Create design run
    is_pareto = individual.get('rank') == 1
    run_id = create_design_run(
        project_id,
        individual['generation'],
        individual['individual'],
        individual.get('rank'),
        is_pareto
    )

    if not run_id:
        return None

    # Save genes as parameters
    params = {}
    for i, gene_val in enumerate(individual['genes']):
        name = gene_names[i] if i < len(gene_names) else f"gene_{i}"
        params[name] = gene_val

    if params:
        save_parameters(run_id, params)

    # Save fitness values as metrics
    metrics = {}
    for i, fit_val in enumerate(individual['fitness']):
        name = fitness_names[i] if i < len(fitness_names) else f"fitness_{i}"
        metrics[name] = fit_val

    # Add rank and crowding distance as metrics
    if individual.get('rank') is not None:
        metrics['pareto_rank'] = individual['rank']
    if individual.get('crowding_distance') is not None:
        metrics['crowding_distance'] = individual['crowding_distance']

    # Save phenotypes as additional metrics
    if phenotype_names and individual.get('phenotypes'):
        for i, pheno_val in enumerate(individual['phenotypes']):
            name = phenotype_names[i] if i < len(phenotype_names) else f"phenotype_{i}"
            metrics[name] = pheno_val

    if metrics:
        save_metrics(run_id, metrics)

    return run_id


# ============================================
# Summary Functions
# ============================================

def format_summary(parsed_data, imported_individuals, gene_names, fitness_names):
    """Format import summary"""
    lines = ["=" * 60]
    lines.append("WALLACEI IMPORT SUMMARY")
    lines.append("=" * 60)
    lines.append("")

    # Data overview
    lines.append(f"Total individuals in CSV: {parsed_data['total_count']}")
    lines.append(f"Imported: {len(imported_individuals)}")
    lines.append("")

    # Column info
    lines.append(f"Genes ({parsed_data['gene_count']}):")
    for i in range(parsed_data['gene_count']):
        name = gene_names[i] if i < len(gene_names) else f"gene_{i}"
        lines.append(f"  [{i}] {name}")

    lines.append("")
    lines.append(f"Fitness Objectives ({parsed_data['fitness_count']}):")
    for i in range(parsed_data['fitness_count']):
        name = fitness_names[i] if i < len(fitness_names) else f"fitness_{i}"
        lines.append(f"  [{i}] {name}")

    if parsed_data['phenotype_count'] > 0:
        lines.append("")
        lines.append(f"Phenotypes ({parsed_data['phenotype_count']})")

    # Generation stats
    if imported_individuals:
        generations = set(ind['generation'] for ind in imported_individuals)
        lines.append("")
        lines.append(f"Generations: {min(generations)} - {max(generations)}")

        pareto_count = sum(1 for ind in imported_individuals if ind.get('rank') == 1)
        lines.append(f"Pareto Front Solutions: {pareto_count}")

    lines.append("")
    lines.append("=" * 60)

    return "\n".join(lines)


# ============================================
# Main Execution
# ============================================

# Default inputs
try:
    run_import
except NameError:
    run_import = False

try:
    import_pareto
except NameError:
    import_pareto = True

try:
    import_all
except NameError:
    import_all = False

try:
    project_id
except NameError:
    project_id = None

try:
    csv_path
except NameError:
    csv_path = None

try:
    gene_names
except NameError:
    gene_names = []

try:
    fitness_names
except NameError:
    fitness_names = []

try:
    phenotype_names
except NameError:
    phenotype_names = []

# Initialize outputs
status = ""
imported_count = 0
pareto_count = 0
summary = ""
run_ids = []

# Validate inputs
if not project_id:
    status = "Error: project_id is required"
elif not csv_path:
    status = "Ready. Provide csv_path to Wallacei export file"
elif not os.path.exists(csv_path):
    status = f"Error: Path not found: {csv_path}"
elif run_import:
    # Execute import
    try:
        csv_files = get_csv_files(csv_path)

        if not csv_files:
            status = "Error: No CSV files found"
        else:
            all_imported = []
            all_parsed = None

            for csv_file in csv_files:
                # Parse CSV
                parsed = parse_wallacei_csv(csv_file)

                if all_parsed is None:
                    all_parsed = parsed
                else:
                    all_parsed['individuals'].extend(parsed['individuals'])
                    all_parsed['total_count'] += parsed['total_count']

                individuals = parsed['individuals']

                # Apply filters
                if not import_all:
                    individuals = filter_last_generation(individuals)

                if import_pareto:
                    individuals = filter_pareto_front(individuals)

                # Import each individual
                for ind in individuals:
                    rid = import_individual(
                        project_id,
                        ind,
                        gene_names if gene_names else [],
                        fitness_names if fitness_names else [],
                        phenotype_names if phenotype_names else []
                    )
                    if rid:
                        run_ids.append(rid)
                        all_imported.append(ind)

            imported_count = len(all_imported)
            pareto_count = sum(1 for ind in all_imported if ind.get('rank') == 1)

            summary = format_summary(
                all_parsed,
                all_imported,
                gene_names if gene_names else [],
                fitness_names if fitness_names else []
            )

            status = f"Success! Imported {imported_count} solutions ({pareto_count} Pareto)"

    except Exception as e:
        status = f"Error: {str(e)}"
        import traceback
        summary = traceback.format_exc()

else:
    # Preview mode - parse but don't import
    try:
        csv_files = get_csv_files(csv_path)

        if csv_files:
            parsed = parse_wallacei_csv(csv_files[0])

            # Count what would be imported
            individuals = parsed['individuals']
            if not import_all:
                individuals = filter_last_generation(individuals)
            if import_pareto:
                individuals = filter_pareto_front(individuals)

            pareto_count = sum(1 for ind in individuals if ind.get('rank') == 1)
            imported_count = len(individuals)

            summary = format_summary(
                parsed,
                individuals,
                gene_names if gene_names else [],
                fitness_names if fitness_names else []
            )

            status = f"Preview: Would import {imported_count} solutions. Set run_import=True to execute."
        else:
            status = "No CSV files found at path"

    except Exception as e:
        status = f"Error parsing CSV: {str(e)}"
