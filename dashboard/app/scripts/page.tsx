'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { getScripts, createScriptWithFile, incrementDownloadCount, Script } from '@/lib/supabase'
import Link from 'next/link'
import { useToast } from '@/components/Toast'

interface SemanticSearchResult {
  script_id: string
  script_name: string
  category: string
  similarity: number
  script?: Script
}

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'massing', label: 'Massing' },
  { value: 'unit_study', label: 'Unit Study' },
  { value: 'facade', label: 'Facade' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'optimization', label: 'Optimization' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'other', label: 'Other' },
]

const CATEGORY_COLORS: Record<string, string> = {
  'massing': 'bg-orange-100 text-orange-800',
  'unit_study': 'bg-blue-100 text-blue-800',
  'facade': 'bg-purple-100 text-purple-800',
  'analysis': 'bg-green-100 text-green-800',
  'optimization': 'bg-red-100 text-red-800',
  'documentation': 'bg-gray-100 text-gray-800',
  'other': 'bg-gray-100 text-gray-600',
}

interface ScriptFormData {
  name: string
  category: Script['category']
  subcategory: string
  version: string
  author: string
  description: string
  dependencies: string
  tags: string
  inputs: string
  outputs: string
}

const INITIAL_FORM: ScriptFormData = {
  name: '',
  category: 'massing',
  subcategory: '',
  version: '1.0.0',
  author: '',
  description: '',
  dependencies: '',
  tags: '',
  inputs: '',
  outputs: '',
}

const PAGE_SIZE = 12

export default function ScriptsPage() {
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [formData, setFormData] = useState<ScriptFormData>(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { showToast } = useToast()

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalScripts, setTotalScripts] = useState(0)
  const totalPages = Math.max(1, Math.ceil(totalScripts / PAGE_SIZE))

  // AI Search state
  const [useAISearch, setUseAISearch] = useState(false)
  const [aiSearchResults, setAiSearchResults] = useState<SemanticSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // File upload state
  const [ghFile, setGhFile] = useState<File | null>(null)
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)

  // Check if AI search is configured
  useEffect(() => {
    async function checkAIConfig() {
      try {
        const response = await fetch('/api/embeddings?action=status')
        const data = await response.json()
        setAiConfigured(data.configured)
      } catch {
        setAiConfigured(false)
      }
    }
    checkAIConfig()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
    loadScripts(1)
  }, [categoryFilter])

  async function loadScripts(page?: number) {
    setLoading(true)
    const p = page ?? currentPage
    try {
      const { data, total } = await getScripts(categoryFilter, {
        offset: (p - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      })
      setScripts(data)
      setTotalScripts(total)
    } catch (error) {
      console.error('Failed to load scripts:', error)
    } finally {
      setLoading(false)
    }
  }

  function handlePageChange(page: number) {
    setCurrentPage(page)
    loadScripts(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // AI semantic search with debounce
  const performAISearch = useCallback(async (query: string) => {
    if (!query.trim() || !useAISearch) {
      setAiSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch('/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          query,
          threshold: 0.3,
          limit: 20
        })
      })

      const data = await response.json()
      if (data.success) {
        setAiSearchResults(data.results)
      }
    } catch (error) {
      console.error('AI search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }, [useAISearch])

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (useAISearch && searchQuery.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        performAISearch(searchQuery)
      }, 500)
    } else {
      setAiSearchResults([])
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, useAISearch, performAISearch])

  // Generate embedding for newly created script
  async function generateEmbedding(scriptId: string) {
    try {
      await fetch('/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          scriptId
        })
      })
    } catch (error) {
      console.error('Failed to generate embedding:', error)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setUploadProgress('Creating script...')

    try {
      if (ghFile) {
        setUploadProgress('Uploading GH file...')
      }
      if (thumbnailFile) {
        setUploadProgress('Uploading thumbnail...')
      }

      // Parse inputs/outputs from "name:type" format
      const parseIOFields = (raw: string) =>
        raw ? raw.split(',').map(s => {
          const [name, type] = s.split(':').map(p => p.trim())
          return { name: name || s.trim(), type: type || 'any' }
        }).filter(i => i.name) : undefined

      const newScript = await createScriptWithFile(
        {
          name: formData.name,
          category: formData.category,
          subcategory: formData.subcategory || undefined,
          version: formData.version,
          author: formData.author || undefined,
          description: formData.description || undefined,
          dependencies: formData.dependencies
            ? formData.dependencies.split(',').map(d => d.trim())
            : [],
          tags: formData.tags
            ? formData.tags.split(',').map(t => t.trim())
            : [],
          inputs: parseIOFields(formData.inputs),
          outputs: parseIOFields(formData.outputs),
        },
        ghFile || undefined,
        thumbnailFile || undefined
      )

      // Generate embedding for AI search (async, non-blocking)
      if (aiConfigured && newScript?.id) {
        setUploadProgress('Generating AI embedding...')
        generateEmbedding(newScript.id)
      }

      setUploadProgress('')
      setShowUploadModal(false)
      setFormData(INITIAL_FORM)
      setGhFile(null)
      setThumbnailFile(null)
      loadScripts(currentPage)
      showToast('Script added successfully', 'success')
    } catch (error) {
      console.error('Failed to create script:', error)
      showToast('Failed to create script: ' + (error as Error).message, 'error')
    } finally {
      setSaving(false)
      setUploadProgress('')
    }
  }

  // File drag and drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    const ghFiles = files.filter(f => f.name.endsWith('.gh') || f.name.endsWith('.ghx'))
    const imageFiles = files.filter(f => f.type.startsWith('image/'))

    if (ghFiles.length > 0) {
      setGhFile(ghFiles[0])
      // Auto-fill name from filename if empty
      if (!formData.name) {
        const baseName = ghFiles[0].name.replace(/\.(gh|ghx)$/, '')
        setFormData({ ...formData, name: baseName })
      }
    }

    if (imageFiles.length > 0) {
      setThumbnailFile(imageFiles[0])
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setGhFile(file)
      if (!formData.name) {
        const baseName = file.name.replace(/\.(gh|ghx)$/, '')
        setFormData({ ...formData, name: baseName })
      }
    }
  }

  function handleThumbnailSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setThumbnailFile(file)
    }
  }

  // Filter scripts by search query
  const filteredScripts = useAISearch && aiSearchResults.length > 0
    ? aiSearchResults
        .map(r => r.script)
        .filter((s): s is Script => s !== undefined)
    : scripts.filter(script =>
        searchQuery === '' ||
        script.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        script.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        script.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )

  // Get similarity score for a script (if in AI search mode)
  const getSimilarity = (scriptId: string): number | null => {
    if (!useAISearch) return null
    const result = aiSearchResults.find(r => r.script_id === scriptId)
    return result?.similarity ?? null
  }

  // Quick download handler
  async function handleQuickDownload(e: React.MouseEvent, script: Script) {
    e.preventDefault()  // Prevent navigation to detail page
    e.stopPropagation()

    if (!script.file_url) {
      showToast('No file available for download', 'info')
      return
    }

    try {
      // Increment download count
      await incrementDownloadCount(script.id)

      // Trigger download
      const link = document.createElement('a')
      link.href = script.file_url
      link.download = `${script.name.replace(/[^a-zA-Z0-9]/g, '_')}_v${script.version}.gh`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Update local state
      setScripts(prev => prev.map(s =>
        s.id === script.id
          ? { ...s, download_count: (s.download_count || 0) + 1 }
          : s
      ))
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GH Store</h1>
          <p className="text-gray-500 text-sm">Tool Warehouse — GH script versioning and sharing</p>
        </div>

        <div className="flex gap-3">
          {/* Search */}
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder={useAISearch ? "AI semantic search..." : "Search scripts..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`pl-9 pr-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 w-56 ${
                useAISearch
                  ? 'border-violet-300 focus:ring-violet-500 bg-violet-50'
                  : 'border-gray-300 focus:ring-emerald-500'
              }`}
            />
            {isSearching ? (
              <svg className="w-4 h-4 text-violet-500 absolute left-3 top-1/2 -translate-y-1/2 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${useAISearch ? 'text-violet-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>

          {/* AI Search Toggle */}
          {aiConfigured && (
            <button
              onClick={() => {
                setUseAISearch(!useAISearch)
                setAiSearchResults([])
              }}
              className={`px-3 py-2 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
                useAISearch
                  ? 'bg-violet-600 text-white'
                  : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
              title="AI Semantic Search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI
            </button>
          )}

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Add Script Button */}
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Script
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-100 rounded-lg h-64 animate-pulse" />
          ))}
        </div>
      ) : filteredScripts.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-emerald-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {searchQuery ? 'No scripts found' : 'No scripts yet'}
          </h3>
          <p className="text-gray-500 mb-6">
            {searchQuery
              ? 'Try a different search term or category'
              : 'Start sharing your Grasshopper definitions with the team.'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              Upload Your First Script
            </button>
          )}
        </div>
      ) : (
        /* Script Grid */
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredScripts.map((script) => (
            <Link
              key={script.id}
              href={`/scripts/${script.id}`}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden group"
            >
              {/* Thumbnail */}
              <div className="h-40 bg-gradient-to-br from-gray-100 to-gray-200 relative overflow-hidden">
                {script.thumbnail_url ? (
                  <img
                    src={script.thumbnail_url}
                    alt={script.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-gray-300 group-hover:text-emerald-400 transition-colors">
                      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                    </div>
                  </div>
                )}
                {/* Category Badge */}
                <span className={`absolute top-2 right-2 text-xs px-2 py-1 rounded-full font-medium ${
                  CATEGORY_COLORS[script.category] || CATEGORY_COLORS['other']
                }`}>
                  {script.category.replace('_', ' ')}
                </span>

                {/* AI Similarity Score */}
                {getSimilarity(script.id) !== null && (
                  <div className="absolute top-2 left-2 bg-violet-600 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    {Math.round((getSimilarity(script.id) || 0) * 100)}%
                  </div>
                )}

                {/* File indicator & Quick Download */}
                {script.file_url ? (
                  <>
                    <div className="absolute bottom-2 left-2 bg-emerald-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      .gh
                    </div>
                    {/* Quick Download Button - appears on hover */}
                    <button
                      onClick={(e) => handleQuickDownload(e, script)}
                      className="absolute bottom-2 right-2 bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      title="Quick Download"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <div className="absolute bottom-2 left-2 bg-gray-400 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    No file
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-emerald-600 transition-colors">
                  {script.name}
                </h3>
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                  {script.description || 'No description'}
                </p>

                {/* Meta */}
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="bg-gray-100 px-2 py-0.5 rounded">v{script.version}</span>
                  <span>{script.author || 'Unknown'}</span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {script.download_count}
                  </span>
                </div>

                {/* Tags */}
                {script.tags && script.tags.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex flex-wrap gap-1">
                      {script.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && !useAISearch && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                className={`px-3 py-1.5 rounded text-sm ${
                  page === currentPage
                    ? 'bg-emerald-600 text-white'
                    : 'border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
            <span className="text-sm text-gray-500 ml-2">
              {totalScripts} scripts
            </span>
          </div>
        )}
        </>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Add New Script</h2>
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setGhFile(null)
                  setThumbnailFile(null)
                  setFormData(INITIAL_FORM)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* File Upload Area */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  GH File *
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-emerald-400 bg-emerald-50'
                      : ghFile
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-gray-300 hover:border-emerald-400'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".gh,.ghx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {ghFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">{ghFile.name}</p>
                        <p className="text-sm text-gray-500">
                          {(ghFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setGhFile(null)
                        }}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <>
                      <svg className="w-10 h-10 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm text-gray-600">
                        Drag & drop your <span className="font-medium">.gh</span> or <span className="font-medium">.ghx</span> file here
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Or click to browse
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Thumbnail Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Thumbnail (optional)
                </label>
                <div className="flex items-center gap-4">
                  <div
                    onClick={() => thumbnailInputRef.current?.click()}
                    className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-emerald-400 overflow-hidden"
                  >
                    <input
                      ref={thumbnailInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleThumbnailSelect}
                      className="hidden"
                    />
                    {thumbnailFile ? (
                      <img
                        src={URL.createObjectURL(thumbnailFile)}
                        alt="Thumbnail preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    <p>Add a screenshot of your GH canvas</p>
                    <p className="text-xs text-gray-400">PNG, JPG up to 5MB</p>
                  </div>
                </div>
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Script Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Massing Generator v2"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category *
                  </label>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as Script['category'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {CATEGORY_OPTIONS.filter(c => c.value !== 'all').map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subcategory
                  </label>
                  <input
                    type="text"
                    value={formData.subcategory}
                    onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                    placeholder="e.g., Residential"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Version
                  </label>
                  <input
                    type="text"
                    value={formData.version}
                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                    placeholder="1.0.0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Author
                  </label>
                  <input
                    type="text"
                    value={formData.author}
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                    placeholder="Your name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what this script does, how to use it, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Dependencies & Tags */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dependencies
                  </label>
                  <input
                    type="text"
                    value={formData.dependencies}
                    onChange={(e) => setFormData({ ...formData, dependencies: e.target.value })}
                    placeholder="Human, Ladybug, Karamba"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Comma-separated plugin names</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags
                  </label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="residential, tower, optimization"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Comma-separated keywords</p>
                </div>
              </div>

              {/* Inputs & Outputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Inputs
                  </label>
                  <input
                    type="text"
                    value={formData.inputs}
                    onChange={(e) => setFormData({ ...formData, inputs: e.target.value })}
                    placeholder="Curve:Curve, Height:Number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">name:type pairs, comma-separated</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Outputs
                  </label>
                  <input
                    type="text"
                    value={formData.outputs}
                    onChange={(e) => setFormData({ ...formData, outputs: e.target.value })}
                    placeholder="Brep:Brep, Area:Number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">name:type pairs, comma-separated</p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-between items-center pt-4 border-t">
                <div className="text-sm text-gray-500">
                  {uploadProgress && (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {uploadProgress}
                    </span>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUploadModal(false)
                      setGhFile(null)
                      setThumbnailFile(null)
                      setFormData(INITIAL_FORM)
                    }}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !formData.name}
                    className="px-6 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving ? 'Uploading...' : 'Add Script'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
