'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Breadcrumb from '@/components/Breadcrumb'

interface DesignRun {
  id: string
  project_id: string
  source: string
  method: string
  purpose: string
  is_selected: boolean
  note: string
  screenshot_url: string
  geometry_url: string
  building_height: number
  floor_count: number
  far_actual: number
  gross_area: number
  net_area: number
  unit_count: number
  unit_mix: Record<string, number>
  parking_count: number
  lot_coverage: number
  created_at: string
  updated_at: string
}

interface Project {
  id: string
  name: string
  phase: string
  project_type: string
  program_type: string
  location: string
  site_area: number
}

interface DesignParameter {
  name: string
  value_numeric: number
  value_text: string
}

interface DesignMetric {
  name: string
  value: number
  unit: string
}

export default function DesignOptionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const runId = params.id as string

  const [run, setRun] = useState<DesignRun | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [parameters, setParameters] = useState<DesignParameter[]>([])
  const [metrics, setMetrics] = useState<DesignMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      if (!runId) return

      try {
        // Load design run
        const { data: runData, error: runError } = await supabase
          .from('design_runs')
          .select('*')
          .eq('id', runId)
          .single()

        if (runError) throw runError
        if (!runData) throw new Error('Design option not found')

        setRun(runData)

        // Load project
        const { data: projectData } = await supabase
          .from('projects')
          .select('*')
          .eq('id', runData.project_id)
          .single()

        setProject(projectData)

        // Load parameters (legacy support)
        const { data: paramsData } = await supabase
          .from('design_parameters')
          .select('*')
          .eq('run_id', runId)

        setParameters(paramsData || [])

        // Load metrics (legacy support)
        const { data: metricsData } = await supabase
          .from('design_metrics')
          .select('*')
          .eq('run_id', runId)

        setMetrics(metricsData || [])

      } catch (err) {
        console.error('Failed to load design option:', err)
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [runId])

  async function toggleSelected() {
    if (!run) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('design_runs')
        .update({ is_selected: !run.is_selected })
        .eq('id', run.id)

      if (error) throw error

      setRun({ ...run, is_selected: !run.is_selected })
    } catch (err) {
      console.error('Failed to update:', err)
    } finally {
      setSaving(false)
    }
  }

  async function deleteOption() {
    if (!run || !confirm('Are you sure you want to delete this design option?')) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('design_runs')
        .delete()
        .eq('id', run.id)

      if (error) throw error

      router.push(project ? `/design-lab/project/${project.id}` : '/design-lab')
    } catch (err) {
      console.error('Failed to delete:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="space-y-6">
        <nav className="text-sm text-gray-500">
          <Link href="/design-lab" className="hover:text-blue-600">Design Lab</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Not Found</span>
        </nav>

        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Design Option Not Found</h3>
          <p className="text-gray-500 mb-4">{error || 'The design option could not be found.'}</p>
          <Link
            href="/design-lab"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Design Lab
          </Link>
        </div>
      </div>
    )
  }

  // Combine direct values with legacy parameters/metrics
  const allMetrics: Record<string, number> = {}
  if (run.far_actual) allMetrics['FAR'] = run.far_actual
  if (run.gross_area) allMetrics['GFA'] = run.gross_area
  if (run.net_area) allMetrics['Net Area'] = run.net_area
  if (run.lot_coverage) allMetrics['Lot Coverage'] = run.lot_coverage
  metrics.forEach(m => { allMetrics[m.name] = m.value })

  const allParams: Record<string, number> = {}
  if (run.building_height) allParams['Building Height'] = run.building_height
  if (run.floor_count) allParams['Floor Count'] = run.floor_count
  if (run.unit_count) allParams['Unit Count'] = run.unit_count
  if (run.parking_count) allParams['Parking Count'] = run.parking_count
  parameters.forEach(p => { allParams[p.name] = p.value_numeric })

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: 'Design Lab', href: '/design-lab' },
        ...(project ? [{ label: project.name, href: `/design-lab/project/${project.id}` }] : []),
        { label: 'Option Detail' },
      ]} />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Design Option</h1>
            {run.is_selected && (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full font-medium">
                Selected
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-1">
            {project?.name} • Created {new Date(run.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleSelected}
            disabled={saving}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              run.is_selected
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-green-600 text-white hover:bg-green-700'
            } disabled:opacity-50`}
          >
            {run.is_selected ? 'Unselect' : 'Mark as Selected'}
          </button>

          <button
            onClick={deleteOption}
            disabled={saving}
            className="px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
          >
            Delete
          </button>

          <Link
            href={project ? `/design-lab/project/${project.id}` : '/design-lab'}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Back to List
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Screenshot */}
        <div className="col-span-2 bg-white rounded-lg shadow overflow-hidden">
          <div className="h-96 bg-gray-100 relative">
            {run.screenshot_url ? (
              <img
                src={run.screenshot_url}
                alt="Design option screenshot"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300">
                <svg className="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>

          {/* Note */}
          {run.note && (
            <div className="p-4 border-t">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Note</h4>
              <p className="text-gray-600">{run.note}</p>
            </div>
          )}
        </div>

        {/* Info Panel */}
        <div className="space-y-4">
          {/* Source & Method */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Source</span>
                <span className={`px-2 py-0.5 rounded font-medium ${
                  run.source === 'wallacei' ? 'bg-purple-100 text-purple-700' :
                  run.source === 'revit' ? 'bg-orange-100 text-orange-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {run.source || 'grasshopper'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Method</span>
                <span className={`px-2 py-0.5 rounded font-medium ${
                  run.method === 'wallacei' ? 'bg-purple-100 text-purple-700' :
                  run.method === 'scipy' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {run.method || 'manual'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Purpose</span>
                <span className="text-gray-900">{run.purpose || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-gray-900">{new Date(run.created_at).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Metrics</h3>
            <div className="space-y-2 text-sm">
              {Object.entries(allMetrics).map(([name, value]) => (
                <div key={name} className="flex justify-between">
                  <span className="text-gray-500">{name}</span>
                  <span className="font-mono text-gray-900">
                    {typeof value === 'number' && value > 1000
                      ? Math.round(value).toLocaleString()
                      : typeof value === 'number'
                        ? value.toFixed(2)
                        : value}
                  </span>
                </div>
              ))}
              {Object.keys(allMetrics).length === 0 && (
                <p className="text-gray-400 italic">No metrics available</p>
              )}
            </div>
          </div>

          {/* Parameters */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Parameters</h3>
            <div className="space-y-2 text-sm">
              {Object.entries(allParams).map(([name, value]) => (
                <div key={name} className="flex justify-between">
                  <span className="text-gray-500">{name}</span>
                  <span className="font-mono text-gray-900">
                    {typeof value === 'number'
                      ? value % 1 === 0
                        ? value.toLocaleString()
                        : value.toFixed(2)
                      : value}
                  </span>
                </div>
              ))}
              {Object.keys(allParams).length === 0 && (
                <p className="text-gray-400 italic">No parameters available</p>
              )}
            </div>
          </div>

          {/* Unit Mix */}
          {run.unit_mix && Object.keys(run.unit_mix).length > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Unit Mix</h3>
              <div className="space-y-2 text-sm">
                {Object.entries(run.unit_mix).map(([type, count]) => (
                  <div key={type} className="flex justify-between">
                    <span className="text-gray-500">{type}</span>
                    <span className="font-mono text-gray-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Geometry Download */}
      {run.geometry_url && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Geometry File</h3>
          <a
            href={run.geometry_url}
            download
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download 3DM File
          </a>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center pt-4 border-t">
        <Link
          href={project ? `/design-lab/project/${project.id}` : '/design-lab'}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          &larr; Back to {project?.name || 'Design Lab'}
        </Link>
        <div className="flex gap-4">
          <Link
            href="/design-lab/optimization"
            className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
          >
            View Optimization Results
          </Link>
        </div>
      </div>
    </div>
  )
}
