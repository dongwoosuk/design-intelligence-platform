"""
GH Python Script: Auto Extract Script Metadata
===============================================
Automatically extracts inputs, outputs, components, and generates
description from the current Grasshopper definition.

INPUTS:
    extract     : bool - Set to True to extract metadata

OUTPUTS:
    name        : str - Suggested script name (from filename)
    description : str - Auto-generated description
    inputs      : str - JSON array of input parameters
    outputs     : str - JSON array of output parameters
    components  : str - List of component types used
    plugins     : str - Detected plugin dependencies
    complexity  : str - Script complexity assessment
"""

import json
import Grasshopper
from Grasshopper.Kernel import GH_Document
from Grasshopper.Kernel.Special import GH_NumberSlider, GH_Panel, GH_BooleanToggle
from Grasshopper.Kernel.Parameters import (
    Param_Number, Param_Integer, Param_String, Param_Boolean,
    Param_Point, Param_Curve, Param_Surface, Param_Brep, Param_Mesh,
    Param_GenericObject, Param_Geometry
)

# ============================================
# Helper Functions
# ============================================

def get_param_type_name(param):
    """Get readable type name for a parameter"""
    type_map = {
        'Param_Number': 'Number',
        'Param_Integer': 'Integer',
        'Param_String': 'String',
        'Param_Boolean': 'Boolean',
        'Param_Point': 'Point',
        'Param_Curve': 'Curve',
        'Param_Surface': 'Surface',
        'Param_Brep': 'Brep',
        'Param_Mesh': 'Mesh',
        'Param_GenericObject': 'Object',
        'Param_Geometry': 'Geometry',
        'GH_NumberSlider': 'Number',
        'GH_Panel': 'Text',
        'GH_BooleanToggle': 'Boolean',
    }

    type_name = type(param).__name__
    return type_map.get(type_name, type_name.replace('Param_', '').replace('GH_', ''))


def is_input_component(obj):
    """Check if object is an input source (no upstream connections)"""
    if hasattr(obj, 'Sources'):
        return len(list(obj.Sources)) == 0
    if hasattr(obj, 'Params') and hasattr(obj.Params, 'Input'):
        for param in obj.Params.Input:
            if param.SourceCount > 0:
                return False
        return True
    return False


def is_output_component(obj):
    """Check if object is an output sink (no downstream connections)"""
    if hasattr(obj, 'Recipients'):
        return len(list(obj.Recipients)) == 0
    if hasattr(obj, 'Params') and hasattr(obj.Params, 'Output'):
        for param in obj.Params.Output:
            if param.RecipientCount > 0:
                return False
        return True
    return False


def get_slider_info(slider):
    """Extract slider configuration"""
    try:
        return {
            'min': float(slider.Slider.Minimum),
            'max': float(slider.Slider.Maximum),
            'current': float(slider.Slider.Value),
            'type': 'Integer' if slider.Slider.Type == 1 else 'Number'
        }
    except:
        return None


def detect_plugins(components):
    """Detect plugin dependencies from component names"""
    plugin_keywords = {
        'Human': ['Human', 'Create Attributes'],
        'LunchBox': ['LunchBox', 'Diamond Panels', 'Quad Panels'],
        'Ladybug': ['Ladybug', 'LB ', 'Honeybee', 'HB '],
        'Karamba': ['Karamba', 'Analyze', 'Line to Beam'],
        'Kangaroo': ['Kangaroo', 'Zombie', 'Bouncy'],
        'Weaverbird': ['Weaverbird', 'wb'],
        'Mesh+': ['Mesh+', 'MeshMachine'],
        'Pufferfish': ['Pufferfish', 'Tween'],
        'Bifocals': ['Bifocals'],
        'Elefront': ['Elefront', 'Bake'],
        'Heteroptera': ['Heteroptera'],
        'Anemone': ['Anemone', 'Loop'],
        'Metahopper': ['Metahopper'],
        'TT Toolbox': ['TT Toolbox'],
        'Clipper': ['Clipper', 'Offset'],
    }

    detected = set()
    component_names = [c['name'] for c in components]

    for plugin, keywords in plugin_keywords.items():
        for keyword in keywords:
            for comp_name in component_names:
                if keyword.lower() in comp_name.lower():
                    detected.add(plugin)
                    break

    return list(detected)


def categorize_by_components(components):
    """Suggest category based on component types"""
    comp_names = ' '.join([c['name'].lower() for c in components])

    categories = {
        'massing': ['extrude', 'solid', 'brep', 'box', 'cylinder', 'volume', 'mass'],
        'facade': ['panel', 'louver', 'curtain', 'facade', 'screen', 'shade', 'fin'],
        'unit_study': ['unit', 'apartment', 'room', 'layout', 'floor plan', 'area'],
        'analysis': ['sun', 'solar', 'view', 'daylight', 'analysis', 'ladybug'],
        'optimization': ['galapagos', 'optimize', 'fitness', 'evolve', 'wallacei'],
        'documentation': ['text', 'dimension', 'annotation', 'label', 'tag'],
    }

    scores = {}
    for cat, keywords in categories.items():
        score = sum(1 for kw in keywords if kw in comp_names)
        if score > 0:
            scores[cat] = score

    if scores:
        return max(scores, key=scores.get)
    return 'other'


def assess_complexity(doc):
    """Assess script complexity"""
    obj_count = doc.ObjectCount

    if obj_count < 20:
        return "Simple"
    elif obj_count < 50:
        return "Moderate"
    elif obj_count < 100:
        return "Complex"
    else:
        return "Very Complex"


def generate_description(name, inputs, outputs, components, category):
    """Generate auto description"""
    parts = []

    # Main description
    parts.append(f"Grasshopper definition for {category.replace('_', ' ')} workflows.")

    # Input summary
    if inputs:
        input_names = [i['name'] for i in inputs[:5]]
        parts.append(f"Key inputs: {', '.join(input_names)}.")

    # Output summary
    if outputs:
        output_names = [o['name'] for o in outputs[:5]]
        parts.append(f"Outputs: {', '.join(output_names)}.")

    # Component summary
    if len(components) > 0:
        parts.append(f"Contains {len(components)} components.")

    return ' '.join(parts)


# ============================================
# Main Extraction Function
# ============================================

def extract_metadata():
    """Extract metadata from current GH document"""

    # Get active document
    doc = Grasshopper.Instances.ActiveCanvas.Document
    if not doc:
        return None, "No active document", None, None, None, None, None

    # Get filename as suggested name
    file_path = doc.FilePath
    if file_path:
        import os
        suggested_name = os.path.splitext(os.path.basename(file_path))[0]
    else:
        suggested_name = "Untitled Script"

    # Extract all objects
    inputs_list = []
    outputs_list = []
    components_list = []

    for obj in doc.Objects:
        obj_name = obj.Name if obj.Name else obj.NickName
        obj_type = type(obj).__name__

        # Collect component info
        comp_info = {
            'name': obj_name,
            'type': obj_type,
            'category': obj.Category if hasattr(obj, 'Category') else 'Unknown'
        }
        components_list.append(comp_info)

        # Check for input parameters (sliders, panels, toggles)
        if isinstance(obj, GH_NumberSlider):
            slider_info = get_slider_info(obj)
            inputs_list.append({
                'name': obj_name,
                'type': slider_info['type'] if slider_info else 'Number',
                'description': f"Range: {slider_info['min']}-{slider_info['max']}" if slider_info else ""
            })
        elif isinstance(obj, GH_Panel):
            if is_input_component(obj):
                inputs_list.append({
                    'name': obj_name,
                    'type': 'Text',
                    'description': 'Text input panel'
                })
        elif isinstance(obj, GH_BooleanToggle):
            inputs_list.append({
                'name': obj_name,
                'type': 'Boolean',
                'description': 'True/False toggle'
            })
        # Check for geometry inputs
        elif hasattr(obj, 'Params'):
            if is_input_component(obj):
                for param in getattr(obj.Params, 'Output', []):
                    inputs_list.append({
                        'name': param.Name or param.NickName,
                        'type': get_param_type_name(param),
                        'description': ''
                    })
            elif is_output_component(obj):
                for param in getattr(obj.Params, 'Output', []):
                    outputs_list.append({
                        'name': param.Name or param.NickName,
                        'type': get_param_type_name(param),
                        'description': ''
                    })

    # Detect plugins
    detected_plugins = detect_plugins(components_list)

    # Suggest category
    suggested_category = categorize_by_components(components_list)

    # Assess complexity
    complexity = assess_complexity(doc)

    # Generate description
    auto_description = generate_description(
        suggested_name,
        inputs_list,
        outputs_list,
        components_list,
        suggested_category
    )

    # Format outputs
    inputs_json = json.dumps(inputs_list, indent=2)
    outputs_json = json.dumps(outputs_list, indent=2)
    components_summary = f"Total: {len(components_list)} components\nCategory suggestion: {suggested_category}"
    plugins_str = ', '.join(detected_plugins) if detected_plugins else 'None detected'

    return (
        suggested_name,
        auto_description,
        inputs_json,
        outputs_json,
        components_summary,
        plugins_str,
        complexity
    )


# ============================================
# Execute
# ============================================

if extract:
    name, description, inputs, outputs, components, plugins, complexity = extract_metadata()
else:
    name = "Set 'extract' to True"
    description = ""
    inputs = ""
    outputs = ""
    components = ""
    plugins = ""
    complexity = ""
