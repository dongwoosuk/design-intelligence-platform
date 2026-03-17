'use client'

import { useEffect, useState } from 'react'
import { getProjectsWithStats, ProjectWithStats } from '@/lib/supabase'
import Link from 'next/link'

export default function DesignLabPage() {
  const [projects, setProjects] = useState<ProjectWithStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const data = await getProjectsWithStats()
        setProjects(data)
      } catch (error) {
        console.error('Failed to load projects:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Calculate totals
  const totalOptions = projects.reduce((sum, p) => sum + p.optionCount, 0)
  const totalSelected = projects.reduce((sum, p) => sum + p.selectedCount, 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Design Lab</h1>
            <p className="text-gray-500 text-sm">Loading projects...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-100 rounded-xl h-64 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Design Lab</h1>
          <p className="text-gray-500 text-sm">
            {projects.length} projects • {totalOptions} design options • {totalSelected} selected
          </p>
        </div>

        <Link
          href="/design-lab/optimization"
          className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
        >
          Optimization Results
        </Link>
      </div>

      {/* Project Cards Grid */}
      {projects.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-blue-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No projects yet</h3>
          <p className="text-gray-500 mb-4">
            Create a project and save design options from Grasshopper.
          </p>
          <Link
            href="/scripts"
            className="text-blue-600 hover:underline text-sm"
          >
            Browse GH Store
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/design-lab/project/${project.id}`}
              className="bg-white rounded-xl shadow hover:shadow-lg transition-all overflow-hidden group"
            >
              {/* Thumbnail / Screenshot */}
              <div className="h-40 bg-gradient-to-br from-blue-500 to-purple-600 relative">
                {project.latestScreenshot ? (
                  <img
                    src={project.latestScreenshot}
                    alt={project.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <svg className="w-16 h-16 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                )}

                {/* Stats Overlay */}
                <div className="absolute top-3 right-3 flex flex-col gap-1">
                  <div className="bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                    {project.optionCount} options
                  </div>
                  {project.selectedCount > 0 && (
                    <div className="bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {project.selectedCount} selected
                    </div>
                  )}
                </div>

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-medium">
                    View Options →
                  </span>
                </div>
              </div>

              {/* Project Info */}
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 text-lg mb-1 group-hover:text-blue-600 transition-colors">
                  {project.name}
                </h3>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  {project.phase && (
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                      {project.phase}
                    </span>
                  )}
                  {project.latestUpdate && (
                    <span className="text-xs">
                      Updated {new Date(project.latestUpdate).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {project.location && (
                  <div className="mt-2 text-xs text-gray-400 truncate">
                    {project.location}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
