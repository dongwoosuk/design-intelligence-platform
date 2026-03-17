'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import {
  bulkImportArchivedProjects,
  ArchivedProject,
  STUDIOS,
  BUILDING_TYPES,
  PROJECT_STATUSES,
  StudioType,
  BuildingType,
  ProjectStatus
} from '@/lib/supabase'

const STATUS_LABELS: Record<ProjectStatus, string> = {
  'completed': 'Completed',
  'not_constructed': 'Not Constructed',
  'entitled': 'Entitled',
  'in_progress': 'In Progress',
}

interface ImportRow {
  name: string
  project_number?: string
  studio?: StudioType
  building_type?: BuildingType
  sub_type?: string
  status: ProjectStatus
  address?: string
  city?: string
  state?: string
  zip_code?: string
  zoning_code?: string
  zoning_far?: number
  site_area?: number
  gross_area?: number
  net_area?: number
  far_actual?: number
  floor_count?: number
  building_height?: number
  unit_count?: number
  avg_unit_size?: number
  parking_count?: number
  parking_ratio?: number
  construction_cost?: number
  cost_per_sf?: number
  design_start?: string
  design_end?: string
  construction_start?: string
  construction_end?: string
  description?: string
  notes?: string
}

interface ValidationError {
  row: number
  field: string
  message: string
}

type ImportProject = Omit<ArchivedProject, 'id' | 'created_at' | 'updated_at'>

export default function ImportProjectsPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ImportRow[]>([])
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [step, setStep] = useState<'upload' | 'preview' | 'complete'>('upload')

  // Template columns
  const templateColumns = [
    'name*', 'project_number', 'studio', 'building_type', 'sub_type', 'status',
    'address', 'city', 'state', 'zip_code', 'zoning_code', 'zoning_far',
    'site_area', 'gross_area', 'net_area', 'far_actual', 'floor_count', 'building_height',
    'unit_count', 'avg_unit_size', 'parking_count', 'parking_ratio',
    'construction_cost', 'cost_per_sf',
    'design_start', 'design_end', 'construction_start', 'construction_end',
    'description', 'notes'
  ]

  // Download template
  const handleDownloadTemplate = useCallback(() => {
    const ws = XLSX.utils.aoa_to_sheet([
      templateColumns,
      // Example row
      [
        'Example Project', 'PRJ-001', 'Development', 'Residential', 'High-Rise', 'completed',
        '123 Main St', 'Los Angeles', 'CA', '90001', 'R4-1', 3.0,
        15000, 250000, 200000, 2.85, 25, 280,
        200, 850, 180, 0.9,
        75000000, 300,
        '2020-01-15', '2021-06-30', '2021-07-01', '2023-12-15',
        'Example mixed-use development', 'Additional notes here'
      ]
    ])

    // Set column widths
    ws['!cols'] = templateColumns.map(() => ({ wch: 15 }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Projects')

    // Add a reference sheet
    const refSheet = XLSX.utils.aoa_to_sheet([
      ['Field', 'Valid Values', 'Notes'],
      ['studio', STUDIOS.join(', '), 'Must match exactly'],
      ['building_type', BUILDING_TYPES.join(', '), 'Must match exactly'],
      ['status', PROJECT_STATUSES.join(', '), 'Must match exactly'],
      ['dates', 'YYYY-MM-DD format', 'e.g., 2024-01-15'],
      ['numbers', 'Numeric values only', 'e.g., 250000, 2.85'],
    ])
    XLSX.utils.book_append_sheet(wb, refSheet, 'Reference')

    XLSX.writeFile(wb, 'project_import_template.xlsx')
  }, [])

  // Parse uploaded file
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0]
    if (!uploadedFile) return

    setFile(uploadedFile)
    setErrors([])

    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = evt.target?.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet)

      // Validate and transform data
      const validationErrors: ValidationError[] = []
      const transformedData: ImportRow[] = []

      jsonData.forEach((row, index) => {
        const rowNum = index + 2 // +2 for 1-indexed and header row

        // Required field validation
        if (!row['name*'] && !row['name']) {
          validationErrors.push({
            row: rowNum,
            field: 'name',
            message: 'Project name is required'
          })
        }

        // Studio validation
        const studio = row['studio'] as string | undefined
        if (studio && !STUDIOS.includes(studio as StudioType)) {
          validationErrors.push({
            row: rowNum,
            field: 'studio',
            message: `Invalid studio: ${studio}. Must be one of: ${STUDIOS.join(', ')}`
          })
        }

        // Building type validation
        const buildingType = row['building_type'] as string | undefined
        if (buildingType && !BUILDING_TYPES.includes(buildingType as BuildingType)) {
          validationErrors.push({
            row: rowNum,
            field: 'building_type',
            message: `Invalid building type: ${buildingType}. Must be one of: ${BUILDING_TYPES.join(', ')}`
          })
        }

        // Status validation
        const status = (row['status'] as string | undefined) || 'completed'
        if (!PROJECT_STATUSES.includes(status as ProjectStatus)) {
          validationErrors.push({
            row: rowNum,
            field: 'status',
            message: `Invalid status: ${status}. Must be one of: ${PROJECT_STATUSES.join(', ')}`
          })
        }

        // Transform the row
        transformedData.push({
          name: row['name*'] || row['name'] || '',
          project_number: row['project_number'] || undefined,
          studio: studio as StudioType | undefined,
          building_type: buildingType as BuildingType | undefined,
          sub_type: row['sub_type'] || undefined,
          status: status as ProjectStatus,
          address: row['address'] || undefined,
          city: row['city'] || undefined,
          state: row['state'] || undefined,
          zip_code: row['zip_code']?.toString() || undefined,
          zoning_code: row['zoning_code'] || undefined,
          zoning_far: parseFloat(row['zoning_far']) || undefined,
          site_area: parseFloat(row['site_area']) || undefined,
          gross_area: parseFloat(row['gross_area']) || undefined,
          net_area: parseFloat(row['net_area']) || undefined,
          far_actual: parseFloat(row['far_actual']) || undefined,
          floor_count: parseInt(row['floor_count']) || undefined,
          building_height: parseFloat(row['building_height']) || undefined,
          unit_count: parseInt(row['unit_count']) || undefined,
          avg_unit_size: parseFloat(row['avg_unit_size']) || undefined,
          parking_count: parseInt(row['parking_count']) || undefined,
          parking_ratio: parseFloat(row['parking_ratio']) || undefined,
          construction_cost: parseFloat(row['construction_cost']) || undefined,
          cost_per_sf: parseFloat(row['cost_per_sf']) || undefined,
          design_start: formatDate(row['design_start']),
          design_end: formatDate(row['design_end']),
          construction_start: formatDate(row['construction_start']),
          construction_end: formatDate(row['construction_end']),
          description: row['description'] || undefined,
          notes: row['notes'] || undefined
        })
      })

      setParsedData(transformedData)
      setErrors(validationErrors)
      setStep('preview')
    }

    reader.readAsBinaryString(uploadedFile)
  }, [])

  // Format date helper
  function formatDate(value: any): string | undefined {
    if (!value) return undefined
    if (typeof value === 'number') {
      // Excel serial date
      const date = XLSX.SSF.parse_date_code(value)
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
    }
    if (typeof value === 'string') {
      // Try to parse date string
      const date = new Date(value)
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    }
    return undefined
  }

  // Import data
  const handleImport = async () => {
    if (errors.length > 0) {
      alert('Please fix validation errors before importing')
      return
    }

    setImporting(true)
    setImportProgress(0)

    try {
      // Convert to proper type
      const projectsToImport: ImportProject[] = parsedData.map(row => ({
        name: row.name,
        project_number: row.project_number,
        studio: row.studio,
        building_type: row.building_type,
        sub_type: row.sub_type,
        status: row.status,
        address: row.address,
        city: row.city,
        state: row.state,
        zip_code: row.zip_code,
        zoning_code: row.zoning_code,
        zoning_far: row.zoning_far,
        site_area: row.site_area,
        gross_area: row.gross_area,
        net_area: row.net_area,
        far_actual: row.far_actual,
        floor_count: row.floor_count,
        building_height: row.building_height,
        unit_count: row.unit_count,
        avg_unit_size: row.avg_unit_size,
        parking_count: row.parking_count,
        parking_ratio: row.parking_ratio,
        construction_cost: row.construction_cost,
        cost_per_sf: row.cost_per_sf,
        design_start: row.design_start,
        design_end: row.design_end,
        construction_start: row.construction_start,
        construction_end: row.construction_end,
        description: row.description,
        notes: row.notes
      }))

      const result = await bulkImportArchivedProjects(projectsToImport)

      setImportProgress(100)
      setStep('complete')

      // Show results
      if (result.failed > 0) {
        alert(`Import completed with ${result.success} successful and ${result.failed} failed imports.`)
      }
    } catch (err) {
      console.error('Import failed:', err)
      alert('Import failed. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/projects"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Import Projects</h1>
            <p className="text-gray-500 text-sm">Batch import projects from Excel file</p>
          </div>
        </div>
      </div>

      {/* Steps Indicator */}
      <div className="flex items-center justify-center gap-4 mb-8">
        {['upload', 'preview', 'complete'].map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s
                ? 'bg-purple-600 text-white'
                : ['upload', 'preview', 'complete'].indexOf(step) > i
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-600'
            }`}>
              {['upload', 'preview', 'complete'].indexOf(step) > i ? '✓' : i + 1}
            </div>
            {i < 2 && (
              <div className={`w-20 h-1 mx-2 ${
                ['upload', 'preview', 'complete'].indexOf(step) > i
                  ? 'bg-green-500'
                  : 'bg-gray-200'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Upload Step */}
      {step === 'upload' && (
        <div className="bg-white rounded-lg shadow p-8">
          <div className="text-center mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload Excel File</h2>
            <p className="text-gray-500">
              Upload an Excel file containing project data
            </p>
          </div>

          {/* Download Template */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-purple-900">Download Template</h3>
                <p className="text-sm text-purple-700">
                  Download the template to prepare data in the correct format
                </p>
              </div>
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Template
              </button>
            </div>
          </div>

          {/* Upload Area */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-purple-400 transition-colors">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-600 mb-4">
              Drag and drop an Excel file or click to browse
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="block mx-auto text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
            />
            <p className="mt-2 text-xs text-gray-500">
              Supported formats: .xlsx, .xls
            </p>
          </div>

          {/* Format Info */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">Required Columns</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="flex items-center gap-1">
                <span className="text-red-500">*</span>
                <span className="text-gray-700">name</span>
              </div>
              <div className="text-gray-500">project_number</div>
              <div className="text-gray-500">studio</div>
              <div className="text-gray-500">building_type</div>
              <div className="text-gray-500">status</div>
              <div className="text-gray-500">city</div>
              <div className="text-gray-500">gross_area</div>
              <div className="text-gray-500">+ more...</div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Step */}
      {step === 'preview' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Preview Data</h2>
              <p className="text-sm text-gray-500">
                {parsedData.length} projects found in {file?.name}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep('upload')
                  setFile(null)
                  setParsedData([])
                  setErrors([])
                }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Upload Different File
              </button>
              <button
                onClick={handleImport}
                disabled={importing || errors.length > 0}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {importing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Importing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Import {parsedData.length} Projects
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Validation Errors */}
          {errors.length > 0 && (
            <div className="p-4 bg-red-50 border-b border-red-200">
              <h3 className="text-sm font-medium text-red-800 mb-2">
                Validation Errors ({errors.length})
              </h3>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {errors.map((err, i) => (
                  <div key={i} className="text-sm text-red-700">
                    Row {err.row}, {err.field}: {err.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Row</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Studio</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GFA</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">FAR</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Units</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {parsedData.map((row, i) => {
                  const rowErrors = errors.filter(e => e.row === i + 2)
                  return (
                    <tr key={i} className={rowErrors.length > 0 ? 'bg-red-50' : ''}>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{i + 1}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{row.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{row.project_number || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{row.studio || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{row.building_type || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                          {STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{row.city || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {row.gross_area ? `${(row.gross_area / 1000).toFixed(0)}k sf` : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {row.far_actual?.toFixed(2) || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {row.unit_count || '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {parsedData.length > 10 && (
            <div className="p-4 text-center text-sm text-gray-500 border-t">
              Showing all {parsedData.length} rows
            </div>
          )}
        </div>
      )}

      {/* Complete Step */}
      {step === 'complete' && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Complete!</h2>
          <p className="text-gray-500 mb-6">
            {parsedData.length} projects have been successfully imported.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => {
                setStep('upload')
                setFile(null)
                setParsedData([])
                setErrors([])
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Import More
            </button>
            <Link
              href="/projects"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              View Projects
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
