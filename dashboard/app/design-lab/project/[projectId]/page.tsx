'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getProject, getDesignOptions, Project, DesignOption } from '@/lib/supabase'
import Breadcrumb from '@/components/Breadcrumb'

export default function ProjectOptionsPage() {
  const params = useParams()
  const projectId = params.projectId as string

  const [project, setProject] = useState<Project | null>(null)
  const [options, setOptions] = useState<DesignOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const [proj, opts] = await Promise.all([
          getProject(projectId),
          getDesignOptions(projectId)
        ])
        setProject(proj)
        setOptions(opts)
      } catch (error) {
        console.error('Failed to load:', error)
      } finally {
        setLoading(false)
      }
    }
    if (projectId) load()
  }, [projectId])

  function toggleOptionSelection(optionId: string) {
    setSelectedOptions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(optionId)) {
        newSet.delete(optionId)
      } else if (newSet.size < 3) {
        newSet.add(optionId)
      }
      return newSet
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Project not found</h2>
        <Link href="/design-lab" className="text-blue-600 hover:underline mt-2 inline-block">
          Back to Design Lab
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Design Lab', href: '/design-lab' },
        { label: project.name },
      ]} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-gray-500 text-sm">
            {options.length} design options
            {project.phase && ` • ${project.phase}`}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/design-lab/optimization"
            className="px-3 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
          >
            Optimization
          </Link>

          {selectedOptions.size >= 2 && (
            <Link
              href={`/design-lab/compare?ids=${Array.from(selectedOptions).join(',')}`}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Compare ({selectedOptions.size})
            </Link>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-2xl font-bold text-blue-600">{options.length}</div>
          <div className="text-xs text-gray-500">Total Options</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-2xl font-bold text-green-600">
            {options.filter(o => o.run.is_selected).length}
          </div>
          <div className="text-xs text-gray-500">Selected</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-2xl font-bold text-purple-600">
            {options.filter(o => o.run.method === 'wallacei' || o.run.method === 'scipy').length}
          </div>
          <div className="text-xs text-gray-500">Optimized</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-2xl font-bold text-gray-900">
            {options.length > 0
              ? Math.round(options.reduce((sum, o) => sum + (o.metrics.FAR || o.metrics.far_actual || 0), 0) / options.length * 100) / 100
              : 0}
          </div>
          <div className="text-xs text-gray-500">Avg FAR</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-2xl font-bold text-gray-900">
            {options.length > 0
              ? Math.round(options.reduce((sum, o) => sum + (o.metrics.GFA || o.metrics.gross_area || 0), 0) / options.length).toLocaleString()
              : 0}
          </div>
          <div className="text-xs text-gray-500">Avg GFA (sqft)</div>
        </div>
      </div>

      {/* Selection Helper */}
      {selectedOptions.size > 0 && selectedOptions.size < 2 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
          Select at least 2 options to compare (currently {selectedOptions.size} selected, max 3)
        </div>
      )}

      {/* Options Grid */}
      {options.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-blue-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No design options</h3>
          <p className="text-gray-500 mb-4">
            Save design options from Grasshopper to see them here.
          </p>
          <Link
            href="/scripts"
            className="text-blue-600 hover:underline text-sm"
          >
            Browse GH Store
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {options.map((opt) => {
            const isCompareSelected = selectedOptions.has(opt.run.id)
            return (
              <div
                key={opt.run.id}
                className={`bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden relative ${
                  opt.run.is_selected ? 'ring-2 ring-green-500' : ''
                } ${isCompareSelected ? 'ring-2 ring-blue-500' : ''}`}
              >
                {/* Compare Checkbox */}
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    toggleOptionSelection(opt.run.id)
                  }}
                  className={`absolute top-2 left-2 z-10 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                    isCompareSelected
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'bg-white/80 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {isCompareSelected && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                <Link href={`/design-lab/${opt.run.id}`}>
                  {/* Screenshot */}
                  <div className="h-32 bg-gray-100 relative">
                    {opt.run.screenshot_url ? (
                      <img
                        src={opt.run.screenshot_url}
                        alt="Design option"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-300">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}

                    {/* Selected Badge */}
                    {opt.run.is_selected && (
                      <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
                        Selected
                      </div>
                    )}

                    {/* Source Badge */}
                    <div className={`absolute bottom-2 left-2 text-white text-xs px-2 py-0.5 rounded ${
                      opt.run.method === 'wallacei' ? 'bg-purple-600' :
                      opt.run.method === 'scipy' ? 'bg-green-600' :
                      'bg-black/50'
                    }`}>
                      {opt.run.method || opt.run.source || 'grasshopper'}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="p-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {opt.metrics.FAR !== undefined && (
                        <div>
                          <span className="text-gray-500">FAR:</span>{' '}
                          <span className="font-medium">{opt.metrics.FAR.toFixed(2)}</span>
                        </div>
                      )}
                      {opt.metrics.GFA !== undefined && (
                        <div>
                          <span className="text-gray-500">GFA:</span>{' '}
                          <span className="font-medium">{Math.round(opt.metrics.GFA).toLocaleString()}</span>
                        </div>
                      )}
                      {opt.run.floor_count && (
                        <div>
                          <span className="text-gray-500">Floors:</span>{' '}
                          <span className="font-medium">{opt.run.floor_count}</span>
                        </div>
                      )}
                      {opt.run.unit_count && (
                        <div>
                          <span className="text-gray-500">Units:</span>{' '}
                          <span className="font-medium">{opt.run.unit_count}</span>
                        </div>
                      )}
                    </div>

                    {/* Date */}
                    <div className="mt-2 text-xs text-gray-400">
                      {new Date(opt.run.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
