'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  getScript,
  updateScript,
  incrementDownload,
  getScriptVersions,
  createScriptVersion,
  getScriptScreenshots,
  Script,
  ScriptVersion,
  ScriptScreenshot
} from '@/lib/supabase'
import Link from 'next/link'
import Viewer3D from '@/components/Viewer3D'
import ImageGallery from '@/components/ImageGallery'
import Breadcrumb from '@/components/Breadcrumb'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useToast } from '@/components/Toast'

const CATEGORY_COLORS: Record<string, string> = {
  'massing': 'bg-orange-100 text-orange-800',
  'unit_study': 'bg-blue-100 text-blue-800',
  'facade': 'bg-purple-100 text-purple-800',
  'analysis': 'bg-green-100 text-green-800',
  'optimization': 'bg-red-100 text-red-800',
  'documentation': 'bg-gray-100 text-gray-800',
  'other': 'bg-gray-100 text-gray-600',
}

const CATEGORY_OPTIONS = [
  { value: 'massing', label: 'Massing' },
  { value: 'unit_study', label: 'Unit Study' },
  { value: 'facade', label: 'Facade' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'optimization', label: 'Optimization' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'other', label: 'Other' },
]

export default function ScriptDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [script, setScript] = useState<Script | null>(null)
  const [versions, setVersions] = useState<ScriptVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showVersionModal, setShowVersionModal] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    category: 'massing' as Script['category'],
    subcategory: '',
    version: '',
    author: '',
    description: '',
    dependencies: '',
    tags: '',
  })
  const [versionForm, setVersionForm] = useState({
    version: '',
    changelog: '',
  })
  const [versionFile, setVersionFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingVersion, setUploadingVersion] = useState(false)

  // AI Description state
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null)
  const [generatingDescription, setGeneratingDescription] = useState(false)
  const [useCases, setUseCases] = useState<string[]>([])
  const [loadingUseCases, setLoadingUseCases] = useState(false)

  // Upload and 3D Viewer state
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false)
  const [uploading3dm, setUploading3dm] = useState(false)
  const [show3DViewer, setShow3DViewer] = useState(false)

  // Screenshots gallery state
  const [screenshots, setScreenshots] = useState<ScriptScreenshot[]>([])
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false)
  const { showToast } = useToast()

  const loadVersions = useCallback(async (scriptId: string) => {
    try {
      const versionData = await getScriptVersions(scriptId)
      setVersions(versionData)
    } catch (error) {
      console.error('Failed to load versions:', error)
    }
  }, [])

  const loadScreenshots = useCallback(async (scriptId: string) => {
    try {
      const screenshotData = await getScriptScreenshots(scriptId)
      setScreenshots(screenshotData)
    } catch (error) {
      console.error('Failed to load screenshots:', error)
    }
  }, [])

  // Check AI config on mount
  useEffect(() => {
    async function checkAIConfig() {
      try {
        const response = await fetch('/api/ai-describe?action=status')
        const data = await response.json()
        setAiConfigured(data.configured)
      } catch {
        setAiConfigured(false)
      }
    }
    checkAIConfig()
  }, [])

  // Generate AI description
  async function generateAIDescription(save: boolean = false) {
    if (!script) return

    setGeneratingDescription(true)
    try {
      const response = await fetch('/api/ai-describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'describe',
          scriptId: script.id,
          save
        })
      })

      const data = await response.json()
      if (data.success && data.description) {
        if (save) {
          // Refresh script data
          const updated = await getScript(script.id)
          setScript(updated)
          setEditForm(prev => ({ ...prev, description: data.description }))
        } else {
          // Just update the edit form
          setEditForm(prev => ({ ...prev, description: data.description }))
        }
      }
    } catch (error) {
      console.error('Failed to generate AI description:', error)
    } finally {
      setGeneratingDescription(false)
    }
  }

  // Generate use cases
  async function loadUseCases() {
    if (!script || useCases.length > 0) return

    setLoadingUseCases(true)
    try {
      const response = await fetch('/api/ai-describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'use-cases',
          scriptId: script.id
        })
      })

      const data = await response.json()
      if (data.success && data.useCases) {
        setUseCases(data.useCases)
      }
    } catch (error) {
      console.error('Failed to load use cases:', error)
    } finally {
      setLoadingUseCases(false)
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const data = await getScript(params.id as string)
        setScript(data)
        if (data) {
          setEditForm({
            name: data.name,
            category: data.category,
            subcategory: data.subcategory || '',
            version: data.version,
            author: data.author || '',
            description: data.description || '',
            dependencies: data.dependencies?.join(', ') || '',
            tags: data.tags?.join(', ') || '',
          })
          // Load versions and screenshots
          await Promise.all([
            loadVersions(data.id),
            loadScreenshots(data.id)
          ])
        }
      } catch (error) {
        console.error('Failed to load script:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [params.id, loadVersions, loadScreenshots])

  async function handleDownload() {
    if (!script) return

    try {
      await incrementDownload(script.id)
      setScript({ ...script, download_count: script.download_count + 1 })

      if (script.file_url) {
        window.open(script.file_url, '_blank')
      } else {
        showToast('No file available for download yet', 'info')
      }
    } catch (error) {
      console.error('Failed to track download:', error)
    }
  }

  async function handleSave() {
    if (!script) return
    setSaving(true)

    try {
      const updated = await updateScript(script.id, {
        name: editForm.name,
        category: editForm.category,
        subcategory: editForm.subcategory || undefined,
        version: editForm.version,
        author: editForm.author || undefined,
        description: editForm.description || undefined,
        dependencies: editForm.dependencies
          ? editForm.dependencies.split(',').map(d => d.trim())
          : [],
        tags: editForm.tags
          ? editForm.tags.split(',').map(t => t.trim())
          : [],
      })

      setScript(updated)
      setShowEditModal(false)
    } catch (error) {
      console.error('Failed to update script:', error)
      showToast('Failed to update script', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadVersion() {
    if (!script || !versionForm.version) return
    setUploadingVersion(true)

    try {
      const newVersion = await createScriptVersion(
        script.id,
        versionForm.version,
        versionForm.changelog || undefined,
        versionFile || undefined
      )

      // Refresh script and versions
      const updatedScript = await getScript(script.id)
      setScript(updatedScript)
      await loadVersions(script.id)

      // Reset form and close modal
      setVersionForm({ version: '', changelog: '' })
      setVersionFile(null)
      setShowVersionModal(false)
    } catch (error) {
      console.error('Failed to upload version:', error)
      showToast('Failed to upload version', 'error')
    } finally {
      setUploadingVersion(false)
    }
  }

  function suggestNextVersion(): string {
    if (!script?.version) return '1.0.1'
    const parts = script.version.split('.')
    if (parts.length === 3) {
      const patch = parseInt(parts[2]) || 0
      return `${parts[0]}.${parts[1]}.${patch + 1}`
    }
    return `${script.version}.1`
  }

  // Upload thumbnail image
  async function handleThumbnailUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !script) return

    setUploadingThumbnail(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('scriptId', script.id)
      formData.append('fileType', 'thumbnail')

      const response = await fetch('/api/scripts/upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      if (data.success) {
        setScript({ ...script, thumbnail_url: data.url })
      } else {
        showToast(`Upload failed: ${data.error}`, 'error')
      }
    } catch (error) {
      console.error('Upload error:', error)
      showToast('Failed to upload thumbnail', 'error')
    } finally {
      setUploadingThumbnail(false)
    }
  }

  // Upload 3D preview file
  async function handle3dmUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !script) return

    setUploading3dm(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('scriptId', script.id)
      formData.append('fileType', '3dm')

      const response = await fetch('/api/scripts/upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      if (data.success) {
        setScript({ ...script, preview_3dm_url: data.url })
      } else {
        showToast(`Upload failed: ${data.error}`, 'error')
      }
    } catch (error) {
      console.error('Upload error:', error)
      showToast('Failed to upload 3D preview', 'error')
    } finally {
      setUploading3dm(false)
    }
  }

  // Upload screenshot to gallery
  async function handleScreenshotUpload() {
    if (!script) return

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (!files || files.length === 0) return

      setUploadingScreenshot(true)
      try {
        for (const file of Array.from(files)) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('scriptId', script.id)
          formData.append('fileType', 'screenshot')

          const response = await fetch('/api/scripts/upload', {
            method: 'POST',
            body: formData
          })

          const data = await response.json()
          if (!data.success) {
            console.error(`Failed to upload ${file.name}:`, data.error)
          }
        }
        // Reload screenshots and refresh script (for thumbnail sync)
        await loadScreenshots(script.id)
        const updatedScript = await getScript(script.id)
        setScript(updatedScript)
      } catch (error) {
        console.error('Upload error:', error)
        showToast('Failed to upload screenshots', 'error')
      } finally {
        setUploadingScreenshot(false)
      }
    }
    input.click()
  }

  // Delete screenshot from gallery
  async function handleScreenshotDelete(screenshotId: string) {
    if (!confirm('Delete this screenshot?')) return
    if (!script) return

    try {
      const response = await fetch(
        `/api/scripts/upload?screenshotId=${screenshotId}&scriptId=${script.id}`,
        { method: 'DELETE' }
      )

      const data = await response.json()
      if (data.success) {
        setScreenshots(prev => prev.filter(s => s.id !== screenshotId))
        // Refresh script to get updated thumbnail_url
        const updatedScript = await getScript(script.id)
        setScript(updatedScript)
      } else {
        showToast(`Delete failed: ${data.error}`, 'error')
      }
    } catch (error) {
      console.error('Delete error:', error)
      showToast('Failed to delete screenshot', 'error')
    }
  }

  // Reorder screenshots
  async function handleScreenshotReorder(screenshotIds: string[]) {
    if (!script) return

    // Optimistic update - reorder locally first
    const reorderedScreenshots = screenshotIds
      .map(id => screenshots.find(s => s.id === id))
      .filter((s): s is ScriptScreenshot => s !== undefined)
    setScreenshots(reorderedScreenshots)

    try {
      const response = await fetch('/api/scripts/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          screenshotIds
        })
      })

      const data = await response.json()
      if (data.success) {
        // Update script thumbnail
        setScript(prev => prev ? { ...prev, thumbnail_url: data.thumbnailUrl } : null)
      } else {
        // Rollback on error
        await loadScreenshots(script.id)
        showToast(`Reorder failed: ${data.error}`, 'error')
      }
    } catch (error) {
      // Rollback on error
      await loadScreenshots(script.id)
      console.error('Reorder error:', error)
      showToast('Failed to reorder screenshots', 'error')
    }
  }

  function openVersionModal() {
    setVersionForm({
      version: suggestNextVersion(),
      changelog: ''
    })
    setVersionFile(null)
    setShowVersionModal(true)
  }

  function handleVersionFileDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.gh') || file.name.endsWith('.ghx'))) {
      setVersionFile(file)
    }
  }

  function handleVersionFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setVersionFile(file)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading script...</div>
      </div>
    )
  }

  if (!script) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Script not found</h2>
        <Link href="/scripts" className="text-emerald-600 hover:underline">
          Back to GH Store
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Breadcrumb items={[
        { label: 'GH Store', href: '/scripts' },
        { label: script.name },
      ]} />

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
        {/* Screenshot Gallery */}
        <div className="relative">
          {/* Category Badge - absolute positioned over gallery */}
          <div className="absolute top-4 right-4 z-20">
            <span className={`text-sm px-3 py-1 rounded-full font-medium ${
              CATEGORY_COLORS[script.category] || CATEGORY_COLORS['other']
            }`}>
              {script.category.replace('_', ' ')}
            </span>
          </div>

          {/* 3D Controls - absolute positioned */}
          <div className="absolute bottom-4 right-4 z-20 flex gap-2">
            {/* Upload 3DM */}
            <label className="px-3 py-1.5 bg-white/90 hover:bg-white text-gray-700 text-sm rounded-lg cursor-pointer flex items-center gap-1.5 shadow-sm backdrop-blur-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              {uploading3dm ? 'Uploading...' : '3D File'}
              <input
                type="file"
                accept=".3dm"
                onChange={handle3dmUpload}
                className="hidden"
                disabled={uploading3dm}
              />
            </label>

            {/* View 3D Button */}
            {script.preview_3dm_url && (
              <button
                onClick={() => setShow3DViewer(true)}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg flex items-center gap-2 shadow-lg"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                View 3D
              </button>
            )}
          </div>

          {/* Image Gallery */}
          <ErrorBoundary fallbackMessage="Failed to load image gallery">
          <ImageGallery
            screenshots={screenshots}
            onUpload={handleScreenshotUpload}
            onDelete={handleScreenshotDelete}
            onReorder={handleScreenshotReorder}
            editable={true}
          />
          </ErrorBoundary>

          {/* Upload progress indicator */}
          {uploadingScreenshot && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-30">
              <div className="bg-white rounded-lg px-6 py-4 flex items-center gap-3">
                <svg className="w-5 h-5 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                <span className="text-gray-700">Uploading screenshots...</span>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{script.name}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {script.author || 'Unknown'}
                </span>
                <span className="bg-gray-100 px-2 py-0.5 rounded font-mono">v{script.version}</span>
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {script.download_count} downloads
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowEditModal(true)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
              <button
                onClick={openVersionModal}
                className="px-4 py-2 border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                New Version
              </button>
              <button
                onClick={handleDownload}
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Description</h2>
              {aiConfigured && (
                <button
                  onClick={() => generateAIDescription(true)}
                  disabled={generatingDescription}
                  className="text-sm text-violet-600 hover:text-violet-700 flex items-center gap-1 disabled:opacity-50"
                  title="Generate AI description"
                >
                  {generatingDescription ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  )}
                  {generatingDescription ? 'Generating...' : 'AI Generate'}
                </button>
              )}
            </div>
            <p className="text-gray-600 whitespace-pre-wrap">
              {script.description || 'No description provided.'}
            </p>

            {/* AI Use Cases */}
            {aiConfigured && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    What you can do with this script
                  </h3>
                  {useCases.length === 0 && (
                    <button
                      onClick={loadUseCases}
                      disabled={loadingUseCases}
                      className="text-xs text-violet-600 hover:text-violet-700 disabled:opacity-50"
                    >
                      {loadingUseCases ? 'Loading...' : 'Generate'}
                    </button>
                  )}
                </div>

                {loadingUseCases ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Analyzing script capabilities...
                  </div>
                ) : useCases.length > 0 ? (
                  <ul className="space-y-2">
                    {useCases.map((useCase, index) => (
                      <li key={index} className="flex items-start gap-2 text-gray-600">
                        <svg className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{useCase}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400">
                    Click "Generate" to see AI-suggested use cases for this script.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Inputs & Outputs */}
          {(script.inputs?.length || script.outputs?.length) && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Parameters</h2>

              {script.inputs && script.inputs.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Inputs</h3>
                  <div className="space-y-2">
                    {script.inputs.map((input, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="bg-blue-100 text-blue-700 text-xs font-mono px-2 py-0.5 rounded">
                          {input.type || 'any'}
                        </span>
                        <div>
                          <span className="font-medium text-gray-900">{input.name}</span>
                          {input.description && (
                            <p className="text-sm text-gray-500 mt-0.5">{input.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {script.outputs && script.outputs.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Outputs</h3>
                  <div className="space-y-2">
                    {script.outputs.map((output, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="bg-green-100 text-green-700 text-xs font-mono px-2 py-0.5 rounded">
                          {output.type || 'any'}
                        </span>
                        <div>
                          <span className="font-medium text-gray-900">{output.name}</span>
                          {output.description && (
                            <p className="text-sm text-gray-500 mt-0.5">{output.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Version History */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Version History</h2>
              <button
                onClick={openVersionModal}
                className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Version
              </button>
            </div>

            {versions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>No version history yet</p>
                <p className="text-sm mt-1">Current version: v{script.version}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Current version indicator */}
                <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                  <span className="bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-0.5 rounded">
                    Current
                  </span>
                  <span className="font-mono text-sm text-gray-900">v{script.version}</span>
                </div>

                {/* Version list */}
                {versions.map((ver, index) => (
                  <div
                    key={ver.id}
                    className={`flex items-start justify-between p-3 rounded-lg ${
                      index === 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-gray-900">
                          v{ver.version}
                        </span>
                        {index === 0 && (
                          <span className="bg-emerald-100 text-emerald-700 text-xs px-1.5 py-0.5 rounded">
                            Latest
                          </span>
                        )}
                      </div>
                      {ver.changelog && (
                        <p className="text-sm text-gray-600 mt-1">{ver.changelog}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(ver.created_at).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    {ver.file_url && (
                      <a
                        href={ver.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-600 hover:text-emerald-700 p-2"
                        title="Download this version"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Info Card */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Info</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Category</dt>
                <dd className="text-gray-900 capitalize">{script.category.replace('_', ' ')}</dd>
              </div>
              {script.subcategory && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Subcategory</dt>
                  <dd className="text-gray-900">{script.subcategory}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Version</dt>
                <dd className="text-gray-900 font-mono">{script.version}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Created</dt>
                <dd className="text-gray-900">
                  {new Date(script.created_at).toLocaleDateString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Updated</dt>
                <dd className="text-gray-900">
                  {new Date(script.updated_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>

          {/* Dependencies */}
          {script.dependencies && script.dependencies.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Dependencies</h2>
              <div className="flex flex-wrap gap-2">
                {script.dependencies.map((dep) => (
                  <span key={dep} className="bg-amber-50 text-amber-700 text-sm px-3 py-1 rounded-full">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {script.tags && script.tags.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {script.tags.map((tag) => (
                  <span key={tag} className="bg-emerald-50 text-emerald-700 text-sm px-3 py-1 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Edit Script</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value as Script['category'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subcategory</label>
                  <input
                    type="text"
                    value={editForm.subcategory}
                    onChange={(e) => setEditForm({ ...editForm, subcategory: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                  <input
                    type="text"
                    value={editForm.version}
                    onChange={(e) => setEditForm({ ...editForm, version: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
                  <input
                    type="text"
                    value={editForm.author}
                    onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  {aiConfigured && (
                    <button
                      type="button"
                      onClick={() => generateAIDescription(false)}
                      disabled={generatingDescription}
                      className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      {generatingDescription ? (
                        <>
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Generating...
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          AI Generate
                        </>
                      )}
                    </button>
                  )}
                </div>
                <textarea
                  rows={4}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Describe what this script does..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dependencies</label>
                  <input
                    type="text"
                    value={editForm.dependencies}
                    onChange={(e) => setEditForm({ ...editForm, dependencies: e.target.value })}
                    placeholder="Human, Ladybug, Karamba"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                  <input
                    type="text"
                    value={editForm.tags}
                    onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                    placeholder="residential, tower"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Version Modal */}
      {showVersionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Upload New Version</h2>
              <button
                onClick={() => setShowVersionModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Current Version Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-500">Current version</p>
                <p className="text-lg font-mono font-medium text-gray-900">v{script.version}</p>
              </div>

              {/* Version Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Version Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={versionForm.version}
                  onChange={(e) => setVersionForm({ ...versionForm, version: e.target.value })}
                  placeholder="e.g., 1.0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Suggested: {suggestNextVersion()}
                </p>
              </div>

              {/* Changelog */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Changelog / Release Notes
                </label>
                <textarea
                  rows={4}
                  value={versionForm.changelog}
                  onChange={(e) => setVersionForm({ ...versionForm, changelog: e.target.value })}
                  placeholder="What's new in this version?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GH File (optional)
                </label>
                <div
                  onDrop={handleVersionFileDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    versionFile
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-gray-300 hover:border-emerald-400'
                  }`}
                >
                  {versionFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">{versionFile.name}</p>
                        <p className="text-sm text-gray-500">
                          {(versionFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        onClick={() => setVersionFile(null)}
                        className="ml-2 text-gray-400 hover:text-red-500"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <>
                      <svg className="w-10 h-10 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-gray-600 mb-1">Drop .gh or .ghx file here</p>
                      <p className="text-sm text-gray-400 mb-3">or click to browse</p>
                      <input
                        type="file"
                        accept=".gh,.ghx"
                        onChange={handleVersionFileSelect}
                        className="hidden"
                        id="version-file-input"
                      />
                      <label
                        htmlFor="version-file-input"
                        className="inline-block px-4 py-2 bg-gray-100 text-gray-700 rounded-md cursor-pointer hover:bg-gray-200"
                      >
                        Browse Files
                      </label>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  If no file is uploaded, only the version record will be created.
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  onClick={() => setShowVersionModal(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadVersion}
                  disabled={uploadingVersion || !versionForm.version}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {uploadingVersion ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Upload Version
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3D Viewer Modal */}
      {show3DViewer && script?.preview_3dm_url && (
        <ErrorBoundary fallbackMessage="Failed to load 3D viewer">
        <Viewer3D
          geometryUrl={script.preview_3dm_url}
          onClose={() => setShow3DViewer(false)}
        />
        </ErrorBoundary>
      )}
    </div>
  )
}
