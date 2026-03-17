'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  getArchivedProject,
  getProjectPrograms,
  getProjectMedia,
  deleteArchivedProject,
  ArchivedProject,
  ProjectProgram,
  ProjectMedia,
  StudioType,
  ProjectStatus
} from '@/lib/supabase'
import Breadcrumb from '@/components/Breadcrumb'

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

const PROGRAM_COLORS: Record<string, string> = {
  'residential': 'bg-blue-500',
  'retail': 'bg-orange-500',
  'office': 'bg-indigo-500',
  'amenity': 'bg-green-500',
  'parking': 'bg-gray-500',
  'lobby': 'bg-amber-500',
  'mechanical': 'bg-slate-500',
  'other': 'bg-gray-400',
}

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [project, setProject] = useState<ArchivedProject | null>(null)
  const [programs, setPrograms] = useState<ProjectProgram[]>([])
  const [media, setMedia] = useState<ProjectMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function load() {
      if (!params.id) return

      try {
        const [projectData, programsData, mediaData] = await Promise.all([
          getArchivedProject(params.id as string),
          getProjectPrograms(params.id as string),
          getProjectMedia(params.id as string)
        ])

        setProject(projectData)
        setPrograms(programsData)
        setMedia(mediaData)

        // Set first image as selected
        if (mediaData.length > 0) {
          const primary = mediaData.find(m => m.is_primary) || mediaData[0]
          setSelectedImage(primary.url)
        }
      } catch (error) {
        console.error('Failed to load project:', error)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [params.id])

  const handleDelete = async () => {
    if (!project) return
    setDeleting(true)

    try {
      await deleteArchivedProject(project.id)
      router.push('/projects')
    } catch (error) {
      console.error('Failed to delete project:', error)
      setDeleting(false)
    }
  }

  const totalProgramArea = programs.reduce((sum, p) => sum + (p.gross_area || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading project...</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Project not found</h2>
        <Link href="/projects" className="text-purple-600 hover:underline">
          Back to Projects
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Project DB', href: '/projects' },
        { label: project.name },
      ]} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div />

        <div className="flex gap-2">
          <Link
            href={`/projects/${project.id}/edit`}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </Link>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-md hover:bg-red-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Image Gallery */}
        <div className="lg:col-span-2 space-y-4">
          {/* Main Image */}
          <div className="relative bg-gray-100 rounded-lg overflow-hidden aspect-video">
            {selectedImage ? (
              <Image
                src={selectedImage}
                alt={project.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                <svg className="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {media.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {media.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedImage(m.url)}
                  className={`relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border-2 ${
                    selectedImage === m.url ? 'border-purple-500' : 'border-transparent'
                  }`}
                >
                  <Image
                    src={m.url}
                    alt={m.caption || project.name}
                    fill
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Project Info */}
        <div className="space-y-6">
          {/* Title & Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                {project.project_number && (
                  <p className="text-sm text-gray-500">#{project.project_number}</p>
                )}
              </div>
              <div className={`px-3 py-1 text-sm font-medium rounded ${STATUS_COLORS[project.status]}`}>
                {STATUS_LABELS[project.status]}
              </div>
            </div>

            {/* Studio & Type */}
            <div className="flex flex-wrap gap-2 mb-4">
              {project.studio && (
                <span className={`px-2 py-1 text-xs font-medium text-white rounded ${STUDIO_COLORS[project.studio]}`}>
                  {project.studio}
                </span>
              )}
              {project.building_type && (
                <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                  {project.building_type}
                </span>
              )}
              {project.sub_type && (
                <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                  {project.sub_type}
                </span>
              )}
            </div>

            {/* Location */}
            {(project.address || project.city) && (
              <div className="text-sm text-gray-600 mb-4">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 mt-0.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div>
                    {project.address && <div>{project.address}</div>}
                    <div>{[project.city, project.state, project.zip_code].filter(Boolean).join(', ')}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Zoning */}
            {project.zoning_code && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">Zoning:</span> {project.zoning_code}
                {project.zoning_far && ` (FAR: ${project.zoning_far})`}
              </div>
            )}
          </div>

          {/* Key Metrics */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Key Metrics</h3>
            <div className="grid grid-cols-2 gap-4">
              {project.gross_area && (
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{(project.gross_area / 1000).toFixed(0)}k</div>
                  <div className="text-xs text-gray-500">GFA (sf)</div>
                </div>
              )}
              {project.far_actual && (
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{project.far_actual.toFixed(2)}</div>
                  <div className="text-xs text-gray-500">FAR</div>
                </div>
              )}
              {project.floor_count && (
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{project.floor_count}</div>
                  <div className="text-xs text-gray-500">Floors</div>
                </div>
              )}
              {project.unit_count && (
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{project.unit_count.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Units</div>
                </div>
              )}
              {project.parking_count && (
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{project.parking_count.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Parking</div>
                </div>
              )}
              {project.efficiency_ratio && (
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{(project.efficiency_ratio * 100).toFixed(0)}%</div>
                  <div className="text-xs text-gray-500">Efficiency</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Program Breakdown */}
      {programs.length > 0 && (
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Program Breakdown</h3>
          <div className="space-y-3">
            {programs.map((program) => {
              const percentage = totalProgramArea > 0 ? ((program.gross_area || 0) / totalProgramArea) * 100 : 0
              return (
                <div key={program.id} className="flex items-center gap-4">
                  <div className="w-24 text-sm font-medium text-gray-700 capitalize">
                    {program.program_type}
                  </div>
                  <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${PROGRAM_COLORS[program.program_type] || PROGRAM_COLORS.other}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="w-24 text-sm text-gray-600 text-right">
                    {program.gross_area ? `${(program.gross_area / 1000).toFixed(0)}k sf` : '-'}
                  </div>
                  <div className="w-16 text-sm text-gray-500 text-right">
                    {percentage.toFixed(0)}%
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Unit Mix */}
      {project.unit_mix && Object.keys(project.unit_mix).length > 0 && (
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Unit Mix</h3>
          <div className="flex flex-wrap gap-4">
            {Object.entries(project.unit_mix).map(([type, count]) => (
              <div key={type} className="text-center px-6 py-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{count}</div>
                <div className="text-xs text-gray-500 uppercase">{type}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Description & Notes */}
      {(project.description || project.notes) && (
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          {project.description && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">Description</h3>
              <p className="text-gray-600 whitespace-pre-wrap">{project.description}</p>
            </div>
          )}
          {project.notes && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">Notes</h3>
              <p className="text-gray-600 whitespace-pre-wrap">{project.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Project?</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete "{project.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
