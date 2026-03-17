import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// Types - Extended Schema v2.0
export interface Project {
  id: string
  name: string
  created_at: string
  // New fields
  phase?: 'SD' | 'DD' | 'CD' | 'completed' | 'archived'
  project_type?: 'internal' | 'competition' | 'study'
  program_type?: string
  project_number?: string
  location?: string
  site_area?: number
  zoning_far?: number
  completed_at?: string
}

export interface DesignRun {
  id: string
  project_id: string
  method: string
  note: string
  screenshot_url: string | null
  geometry_url: string | null
  data_hash: string | null
  created_at: string
  // New fields
  source?: 'grasshopper' | 'wallacei' | 'revit' | 'manual'
  purpose?: 'massing_study' | 'optimization' | 'documentation' | 'as_built'
  is_selected?: boolean
  parent_run_id?: string
  cluster_id?: string
  // Direct result values
  gross_area?: number
  net_area?: number
  far_actual?: number
  lot_coverage?: number
  floor_count?: number
  building_height?: number
  unit_count?: number
  unit_mix?: Record<string, number>
  parking_count?: number
}

export interface DesignParameter {
  id: string
  run_id: string
  name: string
  value_numeric: number
}

export interface DesignMetric {
  id: string
  run_id: string
  name: string
  value: number
  unit: string | null
}

export interface DesignCluster {
  id: string
  project_id: string
  cluster_id: number
  cluster_name?: string
  centroid_params?: Record<string, number>
  run_count?: number
  created_at: string
}

export interface DesignDecision {
  id: string
  run_id: string
  decision_type: 'selected' | 'rejected' | 'revised' | 'shortlisted'
  decided_by?: string
  reason?: string
  decided_at: string
}

// Script Store Types
export interface Script {
  id: string
  name: string
  category: 'massing' | 'unit_study' | 'facade' | 'analysis' | 'optimization' | 'documentation' | 'other'
  subcategory?: string
  version: string
  author?: string
  description?: string
  file_url?: string
  thumbnail_url?: string
  preview_3dm_url?: string
  dependencies?: string[]
  inputs?: Array<{ name: string; type: string; description?: string }>
  outputs?: Array<{ name: string; type: string; description?: string }>
  tags?: string[]
  download_count: number
  created_at: string
  updated_at: string
}

export interface ScriptVersion {
  id: string
  script_id: string
  version: string
  file_url?: string
  changelog?: string
  created_at: string
}

export interface ScriptScreenshot {
  id: string
  script_id: string
  url: string
  storage_path: string
  caption?: string
  sort_order: number
  created_at: string
}

export interface DesignOption {
  run: DesignRun
  params: Record<string, number>
  metrics: Record<string, number>
}

// Extended Project type with stats
export interface ProjectWithStats extends Project {
  optionCount: number
  selectedCount: number
  latestScreenshot?: string
  latestUpdate?: string
}

// API Functions
export async function getProjects(phase?: string): Promise<Project[]> {
  let query = supabase
    .from('projects')
    .select('*')
    .order('name')

  if (phase && phase !== 'all') {
    query = query.eq('phase', phase)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/**
 * Get all projects with aggregated stats from design_runs
 */
export async function getProjectsWithStats(): Promise<ProjectWithStats[]> {
  // Get all projects
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('*')
    .order('name')

  if (projectsError) throw projectsError

  // Get design_runs aggregated by project_id
  const { data: runs, error: runsError } = await supabase
    .from('design_runs')
    .select('project_id, is_selected, screenshot_url, created_at')
    .order('created_at', { ascending: false })

  if (runsError) throw runsError

  // Aggregate stats per project
  const statsMap: Record<string, {
    optionCount: number
    selectedCount: number
    latestScreenshot?: string
    latestUpdate?: string
  }> = {}

  for (const run of runs || []) {
    if (!statsMap[run.project_id]) {
      statsMap[run.project_id] = {
        optionCount: 0,
        selectedCount: 0,
        latestScreenshot: run.screenshot_url || undefined,
        latestUpdate: run.created_at
      }
    }
    statsMap[run.project_id].optionCount++
    if (run.is_selected) {
      statsMap[run.project_id].selectedCount++
    }
  }

  // Merge projects with stats
  return (projects || []).map(project => ({
    ...project,
    optionCount: statsMap[project.id]?.optionCount || 0,
    selectedCount: statsMap[project.id]?.selectedCount || 0,
    latestScreenshot: statsMap[project.id]?.latestScreenshot,
    latestUpdate: statsMap[project.id]?.latestUpdate
  }))
}

export async function getDesignRuns(
  projectId: string,
  filters?: { source?: string; selectedOnly?: boolean }
): Promise<DesignRun[]> {
  let query = supabase
    .from('design_runs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (filters?.source && filters.source !== 'all') {
    query = query.eq('source', filters.source)
  }

  if (filters?.selectedOnly) {
    query = query.eq('is_selected', true)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

export async function getDesignOptions(
  projectId: string,
  filters?: { source?: string; selectedOnly?: boolean }
): Promise<DesignOption[]> {
  const runs = await getDesignRuns(projectId, filters)

  const options: DesignOption[] = []

  for (const run of runs) {
    // New schema: try to get values directly from design_runs first
    const directParams: Record<string, number> = {}
    const directMetrics: Record<string, number> = {}

    if (run.building_height) directParams.height = run.building_height
    if (run.floor_count) directParams.floor_count = run.floor_count
    if (run.far_actual) directMetrics.FAR = run.far_actual
    if (run.gross_area) directMetrics.GFA = run.gross_area
    if (run.unit_count) directMetrics.unit_count = run.unit_count

    // Fallback: Get from design_parameters table
    const { data: params } = await supabase
      .from('design_parameters')
      .select('*')
      .eq('run_id', run.id)

    // Fallback: Get from design_metrics table
    const { data: metrics } = await supabase
      .from('design_metrics')
      .select('*')
      .eq('run_id', run.id)

    const paramMap = Object.fromEntries((params || []).map(p => [p.name, p.value_numeric]))
    const metricMap = Object.fromEntries((metrics || []).map(m => [m.name, m.value]))

    options.push({
      run,
      params: { ...paramMap, ...directParams },
      metrics: { ...metricMap, ...directMetrics }
    })
  }

  return options
}

export async function updateDesignRun(
  runId: string,
  updates: Partial<DesignRun>
): Promise<void> {
  const { error } = await supabase
    .from('design_runs')
    .update(updates)
    .eq('id', runId)

  if (error) throw error
}

export async function markAsSelected(runId: string, selected: boolean): Promise<void> {
  await updateDesignRun(runId, { is_selected: selected })
}

export async function addDesignDecision(
  runId: string,
  decisionType: DesignDecision['decision_type'],
  reason?: string,
  decidedBy?: string
): Promise<void> {
  const { error } = await supabase
    .from('design_decisions')
    .insert({
      run_id: runId,
      decision_type: decisionType,
      reason,
      decided_by: decidedBy
    })

  if (error) throw error
}

export async function updateProject(
  projectId: string,
  updates: Partial<Omit<Project, 'id' | 'created_at'>>
): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)

  if (error) throw error
}

// ============================================
// Script Store API Functions
// ============================================

export async function getScripts(
  category?: string,
  options?: { offset?: number; limit?: number }
): Promise<{ data: Script[]; total: number }> {
  const offset = options?.offset ?? 0
  const limit = options?.limit ?? 1000

  let query = supabase
    .from('scripts')
    .select('*', { count: 'exact' })
    .order('download_count', { ascending: false })
    .range(offset, offset + limit - 1)

  if (category && category !== 'all') {
    query = query.eq('category', category)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { data: data || [], total: count ?? 0 }
}

export async function getScript(id: string): Promise<Script | null> {
  const { data, error } = await supabase
    .from('scripts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createScript(script: Omit<Script, 'id' | 'created_at' | 'updated_at' | 'download_count'>): Promise<Script> {
  const { data, error } = await supabase
    .from('scripts')
    .insert(script)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateScript(id: string, updates: Partial<Script>): Promise<Script> {
  const { data, error } = await supabase
    .from('scripts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function incrementDownload(scriptId: string): Promise<void> {
  const { error } = await supabase.rpc('increment_download', { script_id: scriptId })
  if (error) {
    // Fallback: manual increment
    const script = await getScript(scriptId)
    if (script) {
      await supabase
        .from('scripts')
        .update({ download_count: (script.download_count || 0) + 1 })
        .eq('id', scriptId)
    }
  }
}

// Alias for incrementDownload
export const incrementDownloadCount = incrementDownload

// ============================================
// Dashboard Stats
// ============================================

export interface DashboardStats {
  scripts: { total: number; byCategory: Record<string, number> }
  iterations: { total: number; selected: number; recentProjects: number }
  projects: { total: number; active: number; completed: number }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  // Scripts count
  const { count: scriptsTotal } = await supabase
    .from('scripts')
    .select('*', { count: 'exact', head: true })

  const { data: scriptsByCategory } = await supabase
    .from('scripts')
    .select('category')

  const categoryCount: Record<string, number> = {}
  scriptsByCategory?.forEach(s => {
    categoryCount[s.category] = (categoryCount[s.category] || 0) + 1
  })

  // Iterations count
  const { count: iterationsTotal } = await supabase
    .from('design_runs')
    .select('*', { count: 'exact', head: true })

  const { count: selectedCount } = await supabase
    .from('design_runs')
    .select('*', { count: 'exact', head: true })
    .eq('is_selected', true)

  // Projects with runs in last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data: recentRuns } = await supabase
    .from('design_runs')
    .select('project_id')
    .gte('created_at', thirtyDaysAgo.toISOString())
  const recentProjectIds = new Set(recentRuns?.map(r => r.project_id) || [])

  // Projects count (from archived_projects for Project DB)
  const { count: projectsTotal } = await supabase
    .from('archived_projects')
    .select('*', { count: 'exact', head: true })

  const { count: activeProjects } = await supabase
    .from('archived_projects')
    .select('*', { count: 'exact', head: true })
    .in('status', ['in_progress', 'design', 'construction'])

  const { count: completedProjects } = await supabase
    .from('archived_projects')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')

  return {
    scripts: {
      total: scriptsTotal || 0,
      byCategory: categoryCount
    },
    iterations: {
      total: iterationsTotal || 0,
      selected: selectedCount || 0,
      recentProjects: recentProjectIds.size
    },
    projects: {
      total: projectsTotal || 0,
      active: activeProjects || 0,
      completed: completedProjects || 0
    }
  }
}

// ============================================
// Storage Functions (File Upload)
// ============================================

export async function uploadScriptFile(
  file: File,
  scriptId: string
): Promise<string> {
  // Generate unique filename
  const ext = file.name.split('.').pop() || 'gh'
  const fileName = `${scriptId}/${Date.now()}.${ext}`

  const { data, error } = await supabase.storage
    .from('scripts')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) throw error

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('scripts')
    .getPublicUrl(fileName)

  return urlData.publicUrl
}

export async function uploadScriptThumbnail(
  file: File,
  scriptId: string
): Promise<string> {
  const ext = file.name.split('.').pop() || 'png'
  const fileName = `${scriptId}/thumbnail.${ext}`

  const { data, error } = await supabase.storage
    .from('scripts')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: true  // Allow overwriting thumbnails
    })

  if (error) throw error

  const { data: urlData } = supabase.storage
    .from('scripts')
    .getPublicUrl(fileName)

  return urlData.publicUrl
}

export async function createScriptWithFile(
  scriptData: Omit<Script, 'id' | 'created_at' | 'updated_at' | 'download_count'>,
  file?: File,
  thumbnail?: File
): Promise<Script> {
  // First create the script to get an ID
  const { data: script, error } = await supabase
    .from('scripts')
    .insert({
      ...scriptData,
      file_url: null,
      thumbnail_url: null
    })
    .select()
    .single()

  if (error) throw error

  let file_url = null
  let thumbnail_url = null

  // Upload file if provided
  if (file) {
    try {
      file_url = await uploadScriptFile(file, script.id)
    } catch (e) {
      console.error('Failed to upload file:', e)
    }
  }

  // Upload thumbnail if provided
  if (thumbnail) {
    try {
      thumbnail_url = await uploadScriptThumbnail(thumbnail, script.id)
    } catch (e) {
      console.error('Failed to upload thumbnail:', e)
    }
  }

  // Update script with file URLs
  if (file_url || thumbnail_url) {
    const { data: updated, error: updateError } = await supabase
      .from('scripts')
      .update({
        ...(file_url && { file_url }),
        ...(thumbnail_url && { thumbnail_url })
      })
      .eq('id', script.id)
      .select()
      .single()

    if (updateError) throw updateError
    return updated
  }

  return script
}

export async function deleteScriptFile(scriptId: string): Promise<void> {
  // List all files in script folder
  const { data: files, error: listError } = await supabase.storage
    .from('scripts')
    .list(scriptId)

  if (listError) throw listError

  if (files && files.length > 0) {
    const filePaths = files.map(f => `${scriptId}/${f.name}`)
    const { error: deleteError } = await supabase.storage
      .from('scripts')
      .remove(filePaths)

    if (deleteError) throw deleteError
  }
}

// ============================================
// Version Management API Functions
// ============================================

export async function getScriptVersions(scriptId: string): Promise<ScriptVersion[]> {
  const { data, error } = await supabase
    .from('script_versions')
    .select('*')
    .eq('script_id', scriptId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getScriptVersion(versionId: string): Promise<ScriptVersion | null> {
  const { data, error } = await supabase
    .from('script_versions')
    .select('*')
    .eq('id', versionId)
    .single()

  if (error) throw error
  return data
}

export async function createScriptVersion(
  scriptId: string,
  version: string,
  changelog?: string,
  file?: File
): Promise<ScriptVersion> {
  let file_url: string | undefined

  // Upload file if provided
  if (file) {
    const ext = file.name.split('.').pop() || 'gh'
    const fileName = `${scriptId}/versions/${version.replace(/\./g, '_')}_${Date.now()}.${ext}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('scripts')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage
      .from('scripts')
      .getPublicUrl(fileName)

    file_url = urlData.publicUrl
  }

  // Create version record
  const { data, error } = await supabase
    .from('script_versions')
    .insert({
      script_id: scriptId,
      version,
      changelog,
      file_url
    })
    .select()
    .single()

  if (error) throw error

  // Update main script version and file_url
  const updateData: Partial<Script> = {
    version,
    updated_at: new Date().toISOString()
  }

  if (file_url) {
    updateData.file_url = file_url
  }

  await supabase
    .from('scripts')
    .update(updateData)
    .eq('id', scriptId)

  return data
}

export async function deleteScriptVersion(versionId: string): Promise<void> {
  // Get version to find file URL
  const version = await getScriptVersion(versionId)

  if (version?.file_url) {
    // Extract file path from URL and delete from storage
    const urlParts = version.file_url.split('/scripts/')
    if (urlParts.length > 1) {
      const filePath = urlParts[1]
      await supabase.storage
        .from('scripts')
        .remove([filePath])
    }
  }

  const { error } = await supabase
    .from('script_versions')
    .delete()
    .eq('id', versionId)

  if (error) throw error
}

export async function downloadScriptVersion(
  scriptId: string,
  versionId: string
): Promise<void> {
  // Increment download count on main script
  await incrementDownload(scriptId)
}

// ============================================
// Vector Search / Embedding Functions
// ============================================

export interface ScriptEmbedding {
  id: string
  script_id: string
  embedding: number[]
  embedded_text: string
  model: string
  created_at: string
  updated_at: string
}

export interface SemanticSearchResult {
  script_id: string
  script_name: string
  category: string
  similarity: number
}

/**
 * Generate embedding text from script metadata
 * This is the text that will be vectorized for semantic search
 */
export function generateEmbeddingText(script: Partial<Script>): string {
  const parts: string[] = []

  // Name (most important)
  if (script.name) {
    parts.push(`[Name] ${script.name}`)
  }

  // Description
  if (script.description) {
    parts.push(`[Description] ${script.description}`)
  }

  // Category
  if (script.category) {
    const categoryLabel = script.category.replace('_', ' ')
    parts.push(`[Category] ${categoryLabel}`)
  }

  // Subcategory
  if (script.subcategory) {
    parts.push(`[Subcategory] ${script.subcategory}`)
  }

  // Inputs
  if (script.inputs && script.inputs.length > 0) {
    const inputsText = script.inputs.map(i =>
      `${i.name} (${i.type || 'any'})${i.description ? ': ' + i.description : ''}`
    ).join('\n')
    parts.push(`[Inputs]\n${inputsText}`)
  }

  // Outputs
  if (script.outputs && script.outputs.length > 0) {
    const outputsText = script.outputs.map(o =>
      `${o.name} (${o.type || 'any'})${o.description ? ': ' + o.description : ''}`
    ).join('\n')
    parts.push(`[Outputs]\n${outputsText}`)
  }

  // Dependencies/Plugins
  if (script.dependencies && script.dependencies.length > 0) {
    parts.push(`[Plugins] ${script.dependencies.join(', ')}`)
  }

  // Tags
  if (script.tags && script.tags.length > 0) {
    parts.push(`[Tags] ${script.tags.join(', ')}`)
  }

  // Author
  if (script.author) {
    parts.push(`[Author] ${script.author}`)
  }

  return parts.join('\n\n')
}

/**
 * Store embedding for a script
 */
export async function storeScriptEmbedding(
  scriptId: string,
  embedding: number[],
  embeddedText: string,
  model: string = 'text-embedding-3-small'
): Promise<void> {
  const { error } = await supabase
    .from('script_embeddings')
    .upsert({
      script_id: scriptId,
      embedding,
      embedded_text: embeddedText,
      model,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'script_id'
    })

  if (error) throw error
}

/**
 * Get embedding for a script
 */
export async function getScriptEmbedding(scriptId: string): Promise<ScriptEmbedding | null> {
  const { data, error } = await supabase
    .from('script_embeddings')
    .select('*')
    .eq('script_id', scriptId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }
  return data
}

/**
 * Search scripts using semantic similarity (requires pre-computed query embedding)
 */
export async function searchScriptsBySimilarity(
  queryEmbedding: number[],
  matchThreshold: number = 0.5,
  matchCount: number = 10
): Promise<SemanticSearchResult[]> {
  const { data, error } = await supabase
    .rpc('search_scripts_by_embedding', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount
    })

  if (error) throw error
  return data || []
}

/**
 * Delete embedding when script is deleted
 */
export async function deleteScriptEmbedding(scriptId: string): Promise<void> {
  const { error } = await supabase
    .from('script_embeddings')
    .delete()
    .eq('script_id', scriptId)

  if (error) throw error
}

/**
 * Get scripts that don't have embeddings yet
 */
export async function getScriptsWithoutEmbeddings(): Promise<Script[]> {
  const { data, error } = await supabase
    .from('scripts')
    .select('*')
    .not('id', 'in',
      supabase.from('script_embeddings').select('script_id')
    )

  if (error) {
    // Fallback: get all scripts and filter
    const { data: allScripts } = await getScripts()
    const { data: embeddings } = await supabase
      .from('script_embeddings')
      .select('script_id')

    const embeddedIds = new Set((embeddings || []).map(e => e.script_id))
    return allScripts.filter(s => !embeddedIds.has(s.id))
  }

  return data || []
}

// ============================================
// Script Screenshot Functions
// ============================================

/**
 * Get all screenshots for a script
 */
export async function getScriptScreenshots(scriptId: string): Promise<ScriptScreenshot[]> {
  const { data, error } = await supabase
    .from('script_screenshots')
    .select('*')
    .eq('script_id', scriptId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Add a screenshot to a script
 */
export async function addScriptScreenshot(
  scriptId: string,
  url: string,
  storagePath: string,
  caption?: string
): Promise<ScriptScreenshot> {
  // Get current max sort_order
  const { data: existing } = await supabase
    .from('script_screenshots')
    .select('sort_order')
    .eq('script_id', scriptId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

  const { data, error } = await supabase
    .from('script_screenshots')
    .insert({
      script_id: scriptId,
      url,
      storage_path: storagePath,
      caption,
      sort_order: nextOrder
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Update screenshot caption or order
 */
export async function updateScriptScreenshot(
  screenshotId: string,
  updates: { caption?: string; sort_order?: number }
): Promise<ScriptScreenshot> {
  const { data, error } = await supabase
    .from('script_screenshots')
    .update(updates)
    .eq('id', screenshotId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Delete a screenshot (also removes from storage)
 */
export async function deleteScriptScreenshot(screenshotId: string): Promise<void> {
  // Get screenshot to find storage path
  const { data: screenshot, error: fetchError } = await supabase
    .from('script_screenshots')
    .select('storage_path')
    .eq('id', screenshotId)
    .single()

  if (fetchError) throw fetchError

  // Delete from storage
  if (screenshot?.storage_path) {
    await supabase.storage
      .from('scripts')
      .remove([screenshot.storage_path])
  }

  // Delete from database
  const { error } = await supabase
    .from('script_screenshots')
    .delete()
    .eq('id', screenshotId)

  if (error) throw error
}

/**
 * Reorder screenshots
 */
export async function reorderScriptScreenshots(
  screenshotIds: string[]
): Promise<void> {
  const updates = screenshotIds.map((id, index) => ({
    id,
    sort_order: index
  }))

  for (const update of updates) {
    await supabase
      .from('script_screenshots')
      .update({ sort_order: update.sort_order })
      .eq('id', update.id)
  }
}

// ============================================
// Optimization Analysis Functions
// ============================================

export interface OptimizationRun extends DesignRun {
  project_name?: string
  params: Record<string, number>
  metrics: Record<string, number>
}

export interface OptimizationStats {
  totalRuns: number
  paretoCount: number
  methodCounts: Record<string, number>
  projectCounts: Record<string, number>
}

/**
 * Get all optimization runs across projects
 */
export async function getOptimizationRuns(filters?: {
  projectId?: string
  method?: 'scipy' | 'wallacei' | 'all'
  paretoOnly?: boolean
  limit?: number
}): Promise<OptimizationRun[]> {
  let query = supabase
    .from('design_runs')
    .select(`
      *,
      projects!inner(name)
    `)
    .eq('purpose', 'optimization')
    .order('created_at', { ascending: false })

  if (filters?.projectId) {
    query = query.eq('project_id', filters.projectId)
  }

  if (filters?.method && filters.method !== 'all') {
    query = query.eq('method', filters.method)
  }

  if (filters?.paretoOnly) {
    query = query.eq('is_selected', true)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  const { data: runs, error } = await query

  if (error) throw error

  // Get parameters and metrics for each run
  const optimizationRuns: OptimizationRun[] = []

  for (const run of runs || []) {
    const { data: params } = await supabase
      .from('design_parameters')
      .select('name, value_numeric')
      .eq('run_id', run.id)

    const { data: metrics } = await supabase
      .from('design_metrics')
      .select('name, value')
      .eq('run_id', run.id)

    optimizationRuns.push({
      ...run,
      project_name: run.projects?.name,
      params: Object.fromEntries((params || []).map(p => [p.name, p.value_numeric])),
      metrics: Object.fromEntries((metrics || []).map(m => [m.name, m.value]))
    })
  }

  return optimizationRuns
}

/**
 * Get optimization statistics
 */
export async function getOptimizationStats(): Promise<OptimizationStats> {
  const { data: runs, error } = await supabase
    .from('design_runs')
    .select('id, method, project_id, is_selected')
    .eq('purpose', 'optimization')

  if (error) throw error

  const stats: OptimizationStats = {
    totalRuns: runs?.length || 0,
    paretoCount: 0,
    methodCounts: {},
    projectCounts: {}
  }

  for (const run of runs || []) {
    // Count Pareto solutions
    if (run.is_selected) {
      stats.paretoCount++
    }

    // Count by method
    const method = run.method || 'unknown'
    stats.methodCounts[method] = (stats.methodCounts[method] || 0) + 1

    // Count by project
    stats.projectCounts[run.project_id] = (stats.projectCounts[run.project_id] || 0) + 1
  }

  return stats
}

/**
 * Get unique parameter names from optimization runs
 */
export async function getOptimizationParameterNames(projectId?: string): Promise<string[]> {
  let query = supabase
    .from('design_parameters')
    .select('name, design_runs!inner(purpose, project_id)')

  if (projectId) {
    query = query.eq('design_runs.project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    // Fallback: get all parameter names
    const { data: allParams } = await supabase
      .from('design_parameters')
      .select('name')
    return Array.from(new Set((allParams || []).map(p => p.name)))
  }

  return Array.from(new Set((data || []).map((p: any) => p.name)))
}

/**
 * Get unique metric names from optimization runs
 */
export async function getOptimizationMetricNames(projectId?: string): Promise<string[]> {
  let query = supabase
    .from('design_metrics')
    .select('name, design_runs!inner(purpose, project_id)')

  if (projectId) {
    query = query.eq('design_runs.project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    // Fallback: get all metric names
    const { data: allMetrics } = await supabase
      .from('design_metrics')
      .select('name')
    return Array.from(new Set((allMetrics || []).map(m => m.name)))
  }

  return Array.from(new Set((data || []).map((m: any) => m.name)))
}

// ============================================
// Compare Functions
// ============================================

export interface CompareOption extends DesignOption {
  project_name?: string
}

/**
 * Get design options by IDs for comparison
 */
export async function getDesignOptionsByIds(ids: string[]): Promise<CompareOption[]> {
  if (!ids || ids.length === 0) return []

  const { data: runs, error } = await supabase
    .from('design_runs')
    .select(`
      *,
      projects!inner(name)
    `)
    .in('id', ids)

  if (error) throw error

  const options: CompareOption[] = []

  for (const run of runs || []) {
    // Get direct values from run
    const directParams: Record<string, number> = {}
    const directMetrics: Record<string, number> = {}

    if (run.building_height) directParams.height = run.building_height
    if (run.floor_count) directParams.floor_count = run.floor_count
    if (run.far_actual) directMetrics.FAR = run.far_actual
    if (run.gross_area) directMetrics.GFA = run.gross_area
    if (run.unit_count) directMetrics.unit_count = run.unit_count

    // Get from design_parameters table
    const { data: params } = await supabase
      .from('design_parameters')
      .select('*')
      .eq('run_id', run.id)

    // Get from design_metrics table
    const { data: metrics } = await supabase
      .from('design_metrics')
      .select('*')
      .eq('run_id', run.id)

    const paramMap = Object.fromEntries((params || []).map(p => [p.name, p.value_numeric]))
    const metricMap = Object.fromEntries((metrics || []).map(m => [m.name, m.value]))

    options.push({
      run,
      project_name: run.projects?.name,
      params: { ...paramMap, ...directParams },
      metrics: { ...metricMap, ...directMetrics }
    })
  }

  return options
}

// ============================================
// Archived Projects (Project DB) Functions
// ============================================

export type StudioType = 'Development' | 'Education' | 'Art & Culture' | 'Healthcare' | 'Hospitality' | 'Civic' | 'Other'
export type BuildingType = 'Residential' | 'Office' | 'Mixed-Use' | 'Retail' | 'Hospitality' | 'Education' | 'Healthcare' | 'Civic' | 'Other'
export type ProjectStatus = 'completed' | 'not_constructed' | 'entitled' | 'in_progress'
export type ProgramType = 'residential' | 'retail' | 'office' | 'amenity' | 'parking' | 'lobby' | 'mechanical' | 'other'
export type MediaType = 'image' | 'rendering' | 'model_3d' | 'drawing' | 'document'

export interface ArchivedProject {
  id: string
  name: string
  project_number?: string

  // Classification
  studio?: StudioType
  building_type?: BuildingType
  sub_type?: string
  status: ProjectStatus

  // Location & Zoning
  address?: string
  city?: string
  state?: string
  zip_code?: string
  latitude?: number
  longitude?: number
  zoning_code?: string
  zoning_far?: number
  setback_front?: number
  setback_rear?: number
  setback_side?: number

  // Area Metrics
  site_area?: number
  gross_area?: number
  net_area?: number
  far_actual?: number
  efficiency_ratio?: number
  floor_count?: number
  building_height?: number

  // Unit Info
  unit_count?: number
  unit_mix?: Record<string, number>
  avg_unit_size?: number

  // Parking
  parking_count?: number
  parking_ratio?: number

  // Cost
  construction_cost?: number
  cost_per_sf?: number

  // Dates
  design_start?: string
  design_end?: string
  construction_start?: string
  construction_end?: string

  // Meta
  description?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface ProjectProgram {
  id: string
  project_id: string
  program_type: ProgramType
  floor_level?: string
  gross_area?: number
  net_area?: number
  notes?: string
  created_at: string
}

export interface ProjectMedia {
  id: string
  project_id: string
  media_type: MediaType
  url: string
  storage_path?: string
  caption?: string
  is_primary: boolean
  sort_order: number
  created_at: string
}

export interface ArchivedProjectFilters {
  studio?: StudioType | 'all'
  building_type?: BuildingType | 'all'
  status?: ProjectStatus | 'all'
  city?: string
  search?: string
}

// Studio list for dropdowns
export const STUDIOS: StudioType[] = ['Development', 'Education', 'Art & Culture', 'Healthcare', 'Hospitality', 'Civic', 'Other']
export const BUILDING_TYPES: BuildingType[] = ['Residential', 'Office', 'Mixed-Use', 'Retail', 'Hospitality', 'Education', 'Healthcare', 'Civic', 'Other']
export const PROJECT_STATUSES: ProjectStatus[] = ['completed', 'not_constructed', 'entitled', 'in_progress']
export const PROGRAM_TYPES: ProgramType[] = ['residential', 'retail', 'office', 'amenity', 'parking', 'lobby', 'mechanical', 'other']

/**
 * Get all archived projects with optional filters
 */
export async function getArchivedProjects(filters?: ArchivedProjectFilters): Promise<ArchivedProject[]> {
  let query = supabase
    .from('archived_projects')
    .select('*')
    .order('name')

  if (filters?.studio && filters.studio !== 'all') {
    query = query.eq('studio', filters.studio)
  }

  if (filters?.building_type && filters.building_type !== 'all') {
    query = query.eq('building_type', filters.building_type)
  }

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  if (filters?.city) {
    query = query.ilike('city', `%${filters.city}%`)
  }

  if (filters?.search) {
    query = query.or(`name.ilike.%${filters.search}%,project_number.ilike.%${filters.search}%,address.ilike.%${filters.search}%`)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

/**
 * Get single archived project by ID
 */
export async function getArchivedProject(id: string): Promise<ArchivedProject | null> {
  const { data, error } = await supabase
    .from('archived_projects')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}

/**
 * Create new archived project
 */
export async function createArchivedProject(
  project: Omit<ArchivedProject, 'id' | 'created_at' | 'updated_at'>
): Promise<ArchivedProject> {
  const { data, error } = await supabase
    .from('archived_projects')
    .insert(project)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Update archived project
 */
export async function updateArchivedProject(
  id: string,
  updates: Partial<Omit<ArchivedProject, 'id' | 'created_at'>>
): Promise<ArchivedProject> {
  const { data, error } = await supabase
    .from('archived_projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Delete archived project
 */
export async function deleteArchivedProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('archived_projects')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Get programs for a project
 */
export async function getProjectPrograms(projectId: string): Promise<ProjectProgram[]> {
  const { data, error } = await supabase
    .from('project_programs')
    .select('*')
    .eq('project_id', projectId)
    .order('program_type')

  if (error) throw error
  return data || []
}

/**
 * Create project program
 */
export async function createProjectProgram(
  program: Omit<ProjectProgram, 'id' | 'created_at'>
): Promise<ProjectProgram> {
  const { data, error } = await supabase
    .from('project_programs')
    .insert(program)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Update project program
 */
export async function updateProjectProgram(
  id: string,
  updates: Partial<Omit<ProjectProgram, 'id' | 'project_id' | 'created_at'>>
): Promise<ProjectProgram> {
  const { data, error } = await supabase
    .from('project_programs')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Delete project program
 */
export async function deleteProjectProgram(id: string): Promise<void> {
  const { error } = await supabase
    .from('project_programs')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Get media for a project
 */
export async function getProjectMedia(projectId: string): Promise<ProjectMedia[]> {
  const { data, error } = await supabase
    .from('project_media')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order')

  if (error) throw error
  return data || []
}

/**
 * Get primary image for a project
 */
export async function getProjectPrimaryImage(projectId: string): Promise<ProjectMedia | null> {
  const { data, error } = await supabase
    .from('project_media')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_primary', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // No primary, get first image
      const { data: first } = await supabase
        .from('project_media')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order')
        .limit(1)
        .single()
      return first || null
    }
    throw error
  }
  return data
}

/**
 * Create project media
 */
export async function createProjectMedia(
  media: Omit<ProjectMedia, 'id' | 'created_at'>
): Promise<ProjectMedia> {
  const { data, error } = await supabase
    .from('project_media')
    .insert(media)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Update project media
 */
export async function updateProjectMedia(
  id: string,
  updates: Partial<Omit<ProjectMedia, 'id' | 'project_id' | 'created_at'>>
): Promise<ProjectMedia> {
  const { data, error } = await supabase
    .from('project_media')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Set primary image for a project
 */
export async function setProjectPrimaryImage(projectId: string, mediaId: string): Promise<void> {
  // First, unset all primary flags for this project
  await supabase
    .from('project_media')
    .update({ is_primary: false })
    .eq('project_id', projectId)

  // Set the new primary
  const { error } = await supabase
    .from('project_media')
    .update({ is_primary: true })
    .eq('id', mediaId)

  if (error) throw error
}

/**
 * Delete project media
 */
export async function deleteProjectMedia(id: string): Promise<void> {
  // Get media to find storage path
  const { data: media } = await supabase
    .from('project_media')
    .select('storage_path')
    .eq('id', id)
    .single()

  // Delete from storage if exists
  if (media?.storage_path) {
    await supabase.storage
      .from('projects')
      .remove([media.storage_path])
  }

  const { error } = await supabase
    .from('project_media')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Upload project media file
 */
export async function uploadProjectMedia(
  projectId: string,
  file: File,
  mediaType: MediaType,
  caption?: string
): Promise<ProjectMedia> {
  const ext = file.name.split('.').pop() || 'jpg'
  const fileName = `${projectId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('projects')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage
    .from('projects')
    .getPublicUrl(fileName)

  // Get next sort order
  const { data: existing } = await supabase
    .from('project_media')
    .select('sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

  // Check if this is the first media (should be primary)
  const { count } = await supabase
    .from('project_media')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  return createProjectMedia({
    project_id: projectId,
    media_type: mediaType,
    url: urlData.publicUrl,
    storage_path: fileName,
    caption,
    is_primary: count === 0,
    sort_order: nextOrder
  })
}

/**
 * Bulk import archived projects from parsed data
 */
export async function bulkImportArchivedProjects(
  projects: Omit<ArchivedProject, 'id' | 'created_at' | 'updated_at'>[]
): Promise<{ success: number; failed: number; errors: string[] }> {
  const result = { success: 0, failed: 0, errors: [] as string[] }

  for (const project of projects) {
    try {
      await createArchivedProject(project)
      result.success++
    } catch (error: any) {
      result.failed++
      result.errors.push(`${project.name}: ${error.message}`)
    }
  }

  return result
}

/**
 * Get archived projects stats for dashboard
 */
export async function getArchivedProjectsStats(): Promise<{
  total: number
  byStudio: Record<string, number>
  byStatus: Record<string, number>
  byType: Record<string, number>
}> {
  const { data: projects, error } = await supabase
    .from('archived_projects')
    .select('studio, status, building_type')

  if (error) throw error

  const stats = {
    total: projects?.length || 0,
    byStudio: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    byType: {} as Record<string, number>
  }

  for (const p of projects || []) {
    if (p.studio) {
      stats.byStudio[p.studio] = (stats.byStudio[p.studio] || 0) + 1
    }
    if (p.status) {
      stats.byStatus[p.status] = (stats.byStatus[p.status] || 0) + 1
    }
    if (p.building_type) {
      stats.byType[p.building_type] = (stats.byType[p.building_type] || 0) + 1
    }
  }

  return stats
}
