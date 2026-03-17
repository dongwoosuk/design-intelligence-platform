# Design Intelligence Platform

An AEC design workflow platform connecting Grasshopper to Supabase.
Script version control + design parameter/metric storage + optimization dashboard.

## Features

- **Grasshopper Script Upload & Version Control** — Save GH definitions to a Script Store with full version history
- **Design Option Parameters & Metrics Storage** — Persist design data via Supabase PostgreSQL
- **Built-in Nelder-Mead Optimization** — Automatically optimize design parameters
- **Wallacei Results Import** — Connect evolutionary optimization results from Wallacei
- **Revit RIR Data Extraction** — Collect Revit data through Revit Inside Rhino (RIR)
- **Next.js Web Dashboard** — Browse scripts, visualize design metrics, compare optimization results

## Project Structure

```
gh_supabase/
├── ghpython_script_upload.py      # GH Python: upload script to store
├── ghpython_version_upload.py     # GH Python: upload new version
├── ghpython_design_upload.py      # GH Python: upload design parameters & metrics
├── config.example.py              # Supabase config template (copy to config.py)
├── dashboard/                     # Next.js web dashboard
│   ├── .env.local.example         # Environment variable template
│   ├── app/                       # Next.js App Router
│   └── public/rhino3dm/           # rhino3dm.js library (open-source)
└── supabase/                      # DB migration schemas
```

## Setup

### 1. Create a Supabase Project

Go to [supabase.com](https://supabase.com), create a new project, and copy your Project URL and anon key.

### 2. Configure GH Python Scripts

```bash
cp config.example.py config.py
```

Open `config.py` and fill in your Supabase credentials:

```python
SUPABASE_URL = "https://your-project.supabase.co"
SUPABASE_KEY = "your-anon-key"
```

### 3. Set Up the Dashboard

```bash
cd dashboard
cp .env.local.example .env.local
```

Open `.env.local`, fill in your keys, then run:

```bash
npm install
npm run dev
```

Open your browser at `http://localhost:3000`.

### 4. Environment Variables (Optional)

To change the dashboard URL, set the `DASHBOARD_URL` environment variable:

```bash
# Windows
set DASHBOARD_URL=http://your-server:3000

# macOS/Linux
export DASHBOARD_URL=http://your-server:3000
```

## Usage

### Upload a Script from Grasshopper

1. Paste `ghpython_script_upload.py` into a GH Python component.
2. Add the `config.py` directory to the GH Python search paths.
3. Set the `upload` input to `True` — the current GH definition will be uploaded to the Script Store.

### Save Design Parameters

Use `ghpython_design_upload.py` to save GH parameters and metrics to Supabase. Compare results and explore optimal options from the dashboard.

## Database Schema

Run the migration files in the `supabase/` folder using the Supabase SQL Editor.

## License

[AGPL-3.0](LICENSE) — If you use this software to provide a SaaS service, you are required to release your source code.
For commercial licensing inquiries, please open an issue.
