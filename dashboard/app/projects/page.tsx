'use client'

import { useEffect, useState } from 'react'
import {
  getArchivedProjects,
  getProjectPrimaryImage,
  ArchivedProject,
  ArchivedProjectFilters,
  STUDIOS,
  BUILDING_TYPES,
  PROJECT_STATUSES,
  StudioType,
  BuildingType,
  ProjectStatus
} from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'

const STATUS_COLORS: Record<ProjectStatus, string> = {
  'completed': 'bg-green-100 text-green-800',
  'not_constructed': 'bg-yellow-100 text-yellow-800',
  'entitled': 'bg-blue-100 text-blue-800',
  'in_progress': 'bg-purple-100 text-purple-800',
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  'completed': 'Completed',
  'not_constructed': 'Not Constructed',
  'entitled': 'Entitled',
  'in_progress': 'In Progress',
}

const STUDIO_COLORS: Record<StudioType, string> = {
  'Development': 'bg-emerald-500',
  'Education': 'bg-blue-500',
  'Art & Culture': 'bg-purple-500',
  'Healthcare': 'bg-red-500',
  'Hospitality': 'bg-amber-500',
  'Civic': 'bg-slate-500',
  'Other': 'bg-gray-500',
}

interface ProjectWithImage extends ArchivedProject {
  primaryImage?: string
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithImage[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<ArchivedProjectFilters>({
    studio: 'all',
    building_type: 'all',
    status: 'all',
    search: ''
  })

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await getArchivedProjects(filters)

        // Load primary images for each project
        const projectsWithImages: ProjectWithImage[] = await Promise.all(
          data.map(async (project) => {
            const primaryImage = await getProjectPrimaryImage(project.id)
            return {
              ...project,
              primaryImage: primaryImage?.url
            }
          })
        )

        setProjects(projectsWithImages)
      } catch (error) {
        console.error('Failed to load projects:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filters])

  const handleFilterChange = (key: keyof ArchivedProjectFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project DB</h1>
          <p className="text-gray-500 text-sm">Firm Archive — Completed project database</p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/projects/acc"
            className="px-4 py-2 text-sm border border-orange-300 text-orange-700 rounded-md hover:bg-orange-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            ACC
          </Link>
          <Link
            href="/projects/import"
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Excel
          </Link>
          <Link
            href="/projects/new"
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Project
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <input
              type="text"
              placeholder="Search projects..."
              value={filters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Studio Filter */}
          <select
            value={filters.studio || 'all'}
            onChange={(e) => handleFilterChange('studio', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Studios</option>
            {STUDIOS.map((studio) => (
              <option key={studio} value={studio}>{studio}</option>
            ))}
          </select>

          {/* Type Filter */}
          <select
            value={filters.building_type || 'all'}
            onChange={(e) => handleFilterChange('building_type', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Types</option>
            {BUILDING_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filters.status || 'all'}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Status</option>
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading projects...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
          <p className="text-gray-500 mb-4">
            Start building your project archive by adding your first project.
          </p>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add First Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden group"
            >
              {/* Image */}
              <div className="relative h-48 bg-gray-100">
                {project.primaryImage ? (
                  <Image
                    src={project.primaryImage}
                    alt={project.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                )}

                {/* Studio Badge */}
                {project.studio && (
                  <div className={`absolute top-2 left-2 px-2 py-1 text-xs font-medium text-white rounded ${STUDIO_COLORS[project.studio]}`}>
                    {project.studio}
                  </div>
                )}

                {/* Status Badge */}
                <div className={`absolute top-2 right-2 px-2 py-1 text-xs font-medium rounded ${STATUS_COLORS[project.status]}`}>
                  {STATUS_LABELS[project.status]}
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-1 truncate">
                  {project.name}
                </h2>

                {/* Location */}
                {(project.city || project.state) && (
                  <p className="text-sm text-gray-500 mb-2">
                    {[project.city, project.state].filter(Boolean).join(', ')}
                  </p>
                )}

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                  {project.unit_count && (
                    <div>
                      <span className="font-medium text-gray-700">{project.unit_count.toLocaleString()}</span>
                      <span className="ml-1">units</span>
                    </div>
                  )}
                  {project.far_actual && (
                    <div>
                      <span className="font-medium text-gray-700">{project.far_actual.toFixed(2)}</span>
                      <span className="ml-1">FAR</span>
                    </div>
                  )}
                  {project.gross_area && (
                    <div>
                      <span className="font-medium text-gray-700">{(project.gross_area / 1000).toFixed(0)}k</span>
                      <span className="ml-1">sf GFA</span>
                    </div>
                  )}
                  {project.floor_count && (
                    <div>
                      <span className="font-medium text-gray-700">{project.floor_count}</span>
                      <span className="ml-1">floors</span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Summary */}
      {!loading && projects.length > 0 && (
        <div className="mt-6 text-sm text-gray-500 text-center">
          Showing {projects.length} project{projects.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
