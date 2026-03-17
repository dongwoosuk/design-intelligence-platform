'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getDesignOptionsByIds, CompareOption, markAsSelected } from '@/lib/supabase'

const METHOD_COLORS: Record<string, string> = {
  scipy: 'bg-green-100 text-green-700',
  wallacei: 'bg-purple-100 text-purple-700',
  manual: 'bg-gray-100 text-gray-700',
  grasshopper: 'bg-blue-100 text-blue-700',
}

export default function ComparePage() {
  const searchParams = useSearchParams()
  const ids = searchParams.get('ids')?.split(',').filter(Boolean) || []

  const [options, setOptions] = useState<CompareOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadOptions() {
      if (ids.length === 0) {
        setLoading(false)
        return
      }

      try {
        const data = await getDesignOptionsByIds(ids)
        setOptions(data)
      } catch (error) {
        console.error('Failed to load options:', error)
      } finally {
        setLoading(false)
      }
    }
    loadOptions()
  }, [ids.join(',')])

  // Collect all unique param and metric names
  const allParams = useMemo(() => {
    const params = new Set<string>()
    options.forEach(opt => {
      Object.keys(opt.params).forEach(p => params.add(p))
    })
    return Array.from(params).sort()
  }, [options])

  const allMetrics = useMemo(() => {
    const metrics = new Set<string>()
    options.forEach(opt => {
      Object.keys(opt.metrics).forEach(m => {
        if (m !== 'pareto_rank' && m !== 'crowding_distance') {
          metrics.add(m)
        }
      })
    })
    return Array.from(metrics).sort()
  }, [options])

  // Find best value for each metric (for highlighting)
  const bestValues = useMemo(() => {
    const best: Record<string, { value: number; higher: boolean }> = {}

    // Define which metrics are "higher is better" vs "lower is better"
    const higherIsBetter = ['FAR', 'GFA', 'gross_area', 'unit_count', 'efficiency']

    allMetrics.forEach(metric => {
      const values = options
        .map(opt => opt.metrics[metric])
        .filter(v => v !== undefined && v !== null)

      if (values.length > 0) {
        const isHigher = higherIsBetter.some(h => metric.toLowerCase().includes(h.toLowerCase()))
        best[metric] = {
          value: isHigher ? Math.max(...values) : Math.min(...values),
          higher: isHigher
        }
      }
    })

    return best
  }, [options, allMetrics])

  async function handleSelectWinner(optionId: string) {
    setSaving(true)
    try {
      await markAsSelected(optionId, true)
      setSelectedWinner(optionId)
    } catch (error) {
      console.error('Failed to mark winner:', error)
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

  if (options.length === 0) {
    return (
      <div className="space-y-6">
        <nav className="text-sm text-gray-500">
          <Link href="/design-lab" className="hover:text-blue-600">Design Lab</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Compare</span>
        </nav>

        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-blue-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No options to compare</h3>
          <p className="text-gray-500 mb-4">
            Select 2-3 design options from the Design Lab to compare them side by side.
          </p>
          <Link
            href="/design-lab"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Design Lab
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link href="/design-lab" className="hover:text-blue-600">Design Lab</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Compare Options</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compare Design Options</h1>
          <p className="text-gray-500 mt-1">
            Side-by-side comparison of {options.length} design options
          </p>
        </div>
        <Link
          href="/design-lab"
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back to Design Lab
        </Link>
      </div>

      {/* Options Side-by-Side */}
      <div className={`grid gap-6 ${
        options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
      }`}>
        {options.map((opt, index) => {
          const isWinner = selectedWinner === opt.run.id || opt.run.is_selected
          return (
            <div
              key={opt.run.id}
              className={`bg-white rounded-lg shadow overflow-hidden ${
                isWinner ? 'ring-2 ring-green-500' : ''
              }`}
            >
              {/* Option Header */}
              <div className="bg-gray-50 p-4 border-b">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-semibold text-gray-900">
                    Option {String.fromCharCode(65 + index)}
                  </span>
                  {isWinner && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                      Selected
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500">{opt.project_name}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    METHOD_COLORS[opt.run.method || opt.run.source || 'manual'] || 'bg-gray-100 text-gray-700'
                  }`}>
                    {opt.run.method || opt.run.source || 'manual'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(opt.run.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Screenshot */}
              <div className="h-48 bg-gray-100 relative">
                {opt.run.screenshot_url ? (
                  <img
                    src={opt.run.screenshot_url}
                    alt={`Option ${String.fromCharCode(65 + index)}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-300">
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Metrics */}
              <div className="p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Metrics</h4>
                <div className="space-y-2">
                  {allMetrics.map(metric => {
                    const value = opt.metrics[metric]
                    const best = bestValues[metric]
                    const isBest = best && value === best.value && options.length > 1

                    return (
                      <div key={metric} className="flex justify-between text-sm">
                        <span className="text-gray-500">{metric}</span>
                        <span className={`font-mono ${
                          isBest ? 'text-green-600 font-semibold' : 'text-gray-900'
                        }`}>
                          {value !== undefined
                            ? typeof value === 'number' && value > 1000
                              ? Math.round(value).toLocaleString()
                              : typeof value === 'number'
                                ? value.toFixed(2)
                                : value
                            : '-'
                          }
                          {isBest && (
                            <span className="ml-1 text-green-500">&#9733;</span>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Parameters */}
              {allParams.length > 0 && (
                <div className="p-4 border-t">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Parameters</h4>
                  <div className="space-y-2">
                    {allParams.map(param => {
                      const value = opt.params[param]
                      return (
                        <div key={param} className="flex justify-between text-sm">
                          <span className="text-gray-500">{param}</span>
                          <span className="font-mono text-gray-900">
                            {value !== undefined ? value.toFixed(2) : '-'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Select as Winner Button */}
              <div className="p-4 border-t bg-gray-50">
                {isWinner ? (
                  <div className="text-center text-green-600 font-medium">
                    Selected as Winner
                  </div>
                ) : (
                  <button
                    onClick={() => handleSelectWinner(opt.run.id)}
                    disabled={saving}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Select as Winner'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Detailed Comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Attribute
                </th>
                {options.map((opt, index) => (
                  <th key={opt.run.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Option {String.fromCharCode(65 + index)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {/* Metrics Section */}
              <tr className="bg-purple-50">
                <td colSpan={options.length + 1} className="px-4 py-2 text-xs font-semibold text-purple-700 uppercase">
                  Metrics
                </td>
              </tr>
              {allMetrics.map(metric => {
                const best = bestValues[metric]
                return (
                  <tr key={metric} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-600">{metric}</td>
                    {options.map(opt => {
                      const value = opt.metrics[metric]
                      const isBest = best && value === best.value && options.length > 1
                      return (
                        <td key={opt.run.id} className={`px-4 py-2 text-sm text-center font-mono ${
                          isBest ? 'text-green-600 font-semibold bg-green-50' : 'text-gray-900'
                        }`}>
                          {value !== undefined
                            ? typeof value === 'number' && value > 1000
                              ? Math.round(value).toLocaleString()
                              : typeof value === 'number'
                                ? value.toFixed(2)
                                : value
                            : '-'
                          }
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {/* Parameters Section */}
              {allParams.length > 0 && (
                <>
                  <tr className="bg-blue-50">
                    <td colSpan={options.length + 1} className="px-4 py-2 text-xs font-semibold text-blue-700 uppercase">
                      Parameters
                    </td>
                  </tr>
                  {allParams.map(param => (
                    <tr key={param} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-600">{param}</td>
                      {options.map(opt => (
                        <td key={opt.run.id} className="px-4 py-2 text-sm text-center font-mono text-gray-900">
                          {opt.params[param] !== undefined ? opt.params[param].toFixed(2) : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <Link
          href="/design-lab"
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
        >
          &larr; Back to Design Lab
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
