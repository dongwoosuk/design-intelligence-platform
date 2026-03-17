'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  getOptimizationRuns,
  getOptimizationStats,
  getProjects,
  OptimizationRun,
  OptimizationStats,
  Project
} from '@/lib/supabase'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ZAxis
} from 'recharts'

const METHOD_COLORS: Record<string, string> = {
  scipy: '#10B981',   // green
  wallacei: '#8B5CF6', // purple
  manual: '#6B7280',  // gray
}

const METHOD_LABELS: Record<string, string> = {
  scipy: 'SciPy Optimizer',
  wallacei: 'Wallacei GA',
  manual: 'Manual',
}

interface ParallelCoordData {
  id: string
  method: string
  isPareto: boolean
  [key: string]: string | number | boolean
}

export default function OptimizationPage() {
  const [runs, setRuns] = useState<OptimizationRun[]>([])
  const [stats, setStats] = useState<OptimizationStats | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [selectedMethod, setSelectedMethod] = useState<string>('all')
  const [paretoOnly, setParetoOnly] = useState(false)

  // Chart axes
  const [xAxis, setXAxis] = useState<string>('')
  const [yAxis, setYAxis] = useState<string>('')
  const [colorBy, setColorBy] = useState<'method' | 'pareto'>('method')

  // Available metrics for axes
  const availableMetrics = useMemo(() => {
    const metrics = new Set<string>()
    runs.forEach(run => {
      Object.keys(run.metrics).forEach(m => metrics.add(m))
    })
    return Array.from(metrics).filter(m => m !== 'pareto_rank' && m !== 'crowding_distance')
  }, [runs])

  // Available parameters for parallel coordinates
  const availableParams = useMemo(() => {
    const params = new Set<string>()
    runs.forEach(run => {
      Object.keys(run.params).forEach(p => params.add(p))
    })
    return Array.from(params)
  }, [runs])

  async function loadData() {
    try {
      const [runsData, statsData, projectsData] = await Promise.all([
        getOptimizationRuns({
          projectId: selectedProject !== 'all' ? selectedProject : undefined,
          method: selectedMethod as 'scipy' | 'wallacei' | 'all',
          paretoOnly
        }),
        getOptimizationStats(),
        getProjects()
      ])

      setRuns(runsData)
      setStats(statsData)
      setProjects(projectsData)

      // Set default axes if not set
      if (!xAxis && runsData.length > 0) {
        const metrics = Object.keys(runsData[0].metrics).filter(
          m => m !== 'pareto_rank' && m !== 'crowding_distance'
        )
        if (metrics.length >= 2) {
          setXAxis(metrics[0])
          setYAxis(metrics[1])
        } else if (metrics.length === 1) {
          setXAxis(metrics[0])
          setYAxis(metrics[0])
        }
      }
    } catch (error) {
      console.error('Failed to load optimization data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedProject, selectedMethod, paretoOnly])

  // Prepare scatter chart data
  const scatterData = useMemo(() => {
    if (!xAxis || !yAxis) return { scipy: [], wallacei: [], manual: [] }

    const grouped: Record<string, any[]> = { scipy: [], wallacei: [], manual: [] }

    runs.forEach(run => {
      const xVal = run.metrics[xAxis]
      const yVal = run.metrics[yAxis]

      if (xVal !== undefined && yVal !== undefined) {
        const method = run.method || 'manual'
        if (!grouped[method]) grouped[method] = []
        grouped[method].push({
          x: xVal,
          y: yVal,
          id: run.id,
          isPareto: run.is_selected,
          project: run.project_name,
          method: run.method
        })
      }
    })

    return grouped
  }, [runs, xAxis, yAxis])

  // Prepare parallel coordinates data
  const parallelData = useMemo((): ParallelCoordData[] => {
    return runs.map(run => ({
      id: run.id,
      method: run.method || 'manual',
      isPareto: run.is_selected || false,
      ...run.params,
      ...run.metrics
    }))
  }, [runs])

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border text-sm">
          <p className="font-medium">{data.project}</p>
          <p className="text-gray-600">
            {xAxis}: {data.x?.toFixed(2)}
          </p>
          <p className="text-gray-600">
            {yAxis}: {data.y?.toFixed(2)}
          </p>
          <p className="text-gray-500 text-xs mt-1">
            {METHOD_LABELS[data.method] || data.method}
            {data.isPareto && ' (Pareto)'}
          </p>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link href="/design-lab" className="hover:text-blue-600">Design Lab</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Optimization</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Optimization Results</h1>
          <p className="text-gray-500 mt-1">
            SciPy & Wallacei optimization analysis
          </p>
        </div>
        <Link
          href="/design-lab"
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back to Design Lab
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Total Runs</div>
          <div className="text-2xl font-bold text-gray-900">{stats?.totalRuns || 0}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Pareto Solutions</div>
          <div className="text-2xl font-bold text-purple-600">{stats?.paretoCount || 0}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">SciPy Runs</div>
          <div className="text-2xl font-bold text-green-600">
            {stats?.methodCounts['scipy'] || 0}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Wallacei Runs</div>
          <div className="text-2xl font-bold text-purple-600">
            {stats?.methodCounts['wallacei'] || 0}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Project</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Method</label>
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All Methods</option>
              <option value="scipy">SciPy</option>
              <option value="wallacei">Wallacei</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="paretoOnly"
              checked={paretoOnly}
              onChange={(e) => setParetoOnly(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="paretoOnly" className="text-sm text-gray-700">
              Pareto Front Only
            </label>
          </div>

          <div className="ml-auto text-sm text-gray-500">
            Showing {runs.length} runs
          </div>
        </div>
      </div>

      {/* Pareto Front Chart */}
      <div className="bg-white p-6 rounded-lg border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Pareto Front</h2>
          <div className="flex gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">X Axis</label>
              <select
                value={xAxis}
                onChange={(e) => setXAxis(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                {availableMetrics.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Y Axis</label>
              <select
                value={yAxis}
                onChange={(e) => setYAxis(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                {availableMetrics.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {runs.length > 0 && xAxis && yAxis ? (
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                name={xAxis}
                label={{ value: xAxis, position: 'bottom', offset: 40 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={yAxis}
                label={{ value: yAxis, angle: -90, position: 'left', offset: 40 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" />

              {Object.entries(scatterData).map(([method, data]) => (
                data.length > 0 && (
                  <Scatter
                    key={method}
                    name={METHOD_LABELS[method] || method}
                    data={data}
                    fill={METHOD_COLORS[method] || '#6B7280'}
                    shape={(props: any) => {
                      const { cx, cy, payload } = props
                      const isPareto = payload?.isPareto
                      return isPareto ? (
                        <polygon
                          points={`${cx},${cy - 8} ${cx + 7},${cy + 4} ${cx - 7},${cy + 4}`}
                          fill={METHOD_COLORS[method] || '#6B7280'}
                          stroke="#fff"
                          strokeWidth={1}
                        />
                      ) : (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={5}
                          fill={METHOD_COLORS[method] || '#6B7280'}
                          fillOpacity={0.6}
                        />
                      )
                    }}
                  />
                )
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[400px] flex items-center justify-center text-gray-500">
            No optimization data available. Import Wallacei results or run SciPy optimization.
          </div>
        )}

        <div className="mt-4 flex gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <polygon points="6,0 12,10 0,10" fill="#6B7280" />
            </svg>
            Pareto Front
          </div>
          <div className="flex items-center gap-2">
            <svg width="12" height="12">
              <circle cx="6" cy="6" r="5" fill="#6B7280" fillOpacity="0.6" />
            </svg>
            Dominated Solutions
          </div>
        </div>
      </div>

      {/* Parameter Comparison Table */}
      <div className="bg-white p-6 rounded-lg border">
        <h2 className="text-lg font-semibold mb-4">Parameter Comparison</h2>

        {runs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Project</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Method</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-500">Pareto</th>
                  {availableParams.slice(0, 5).map(param => (
                    <th key={param} className="text-right py-2 px-3 font-medium text-gray-500">
                      {param}
                    </th>
                  ))}
                  {availableMetrics.slice(0, 3).map(metric => (
                    <th key={metric} className="text-right py-2 px-3 font-medium text-purple-600">
                      {metric}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 20).map(run => (
                  <tr key={run.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">
                      <Link
                        href={`/design-lab/${run.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {run.project_name}
                      </Link>
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          backgroundColor: `${METHOD_COLORS[run.method || 'manual']}20`,
                          color: METHOD_COLORS[run.method || 'manual']
                        }}
                      >
                        {run.method || 'manual'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {run.is_selected && (
                        <span className="text-yellow-500">&#9733;</span>
                      )}
                    </td>
                    {availableParams.slice(0, 5).map(param => (
                      <td key={param} className="py-2 px-3 text-right font-mono text-gray-600">
                        {run.params[param]?.toFixed(2) || '-'}
                      </td>
                    ))}
                    {availableMetrics.slice(0, 3).map(metric => (
                      <td key={metric} className="py-2 px-3 text-right font-mono text-purple-600">
                        {run.metrics[metric]?.toFixed(3) || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {runs.length > 20 && (
              <div className="mt-4 text-center text-sm text-gray-500">
                Showing 20 of {runs.length} runs
              </div>
            )}
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-gray-500">
            No data to display
          </div>
        )}
      </div>

      {/* Method Comparison */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border">
          <h3 className="font-semibold mb-4">SciPy Optimizer</h3>
          <div className="space-y-2 text-sm">
            <p className="text-gray-600">
              <span className="font-medium">{stats?.methodCounts['scipy'] || 0}</span> runs
            </p>
            <p className="text-gray-500">
              Gradient-free optimization using Nelder-Mead algorithm.
              Best for single-objective optimization with quick convergence.
            </p>
            <div className="pt-2">
              <span className="inline-block px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                Fast
              </span>
              <span className="inline-block px-2 py-1 bg-green-100 text-green-700 rounded text-xs ml-2">
                Single Objective
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border">
          <h3 className="font-semibold mb-4">Wallacei (Genetic Algorithm)</h3>
          <div className="space-y-2 text-sm">
            <p className="text-gray-600">
              <span className="font-medium">{stats?.methodCounts['wallacei'] || 0}</span> runs
            </p>
            <p className="text-gray-500">
              NSGA-II evolutionary optimization for multi-objective problems.
              Generates Pareto front for trade-off analysis.
            </p>
            <div className="pt-2">
              <span className="inline-block px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                Multi-Objective
              </span>
              <span className="inline-block px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs ml-2">
                Pareto Front
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
