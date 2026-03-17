'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  createArchivedProject,
  uploadProjectMedia,
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

type FormData = Omit<ArchivedProject, 'id' | 'created_at' | 'updated_at'>

export default function NewProjectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'basic' | 'location' | 'metrics' | 'dates'>('basic')
  const [primaryImage, setPrimaryImage] = useState<File | null>(null)
  const [primaryImagePreview, setPrimaryImagePreview] = useState<string | null>(null)
  const [fromACC, setFromACC] = useState(false)

  const [form, setForm] = useState<FormData>({
    name: '',
    project_number: '',
    studio: undefined,
    building_type: undefined,
    sub_type: '',
    status: 'completed',
    // Location
    address: '',
    city: '',
    state: 'CA',
    zip_code: '',
    latitude: undefined,
    longitude: undefined,
    zoning_code: '',
    zoning_far: undefined,
    setback_front: undefined,
    setback_rear: undefined,
    setback_side: undefined,
    // Metrics
    site_area: undefined,
    gross_area: undefined,
    net_area: undefined,
    far_actual: undefined,
    efficiency_ratio: undefined,
    floor_count: undefined,
    building_height: undefined,
    // Units
    unit_count: undefined,
    unit_mix: undefined,
    avg_unit_size: undefined,
    // Parking
    parking_count: undefined,
    parking_ratio: undefined,
    // Cost
    construction_cost: undefined,
    cost_per_sf: undefined,
    // Dates
    design_start: undefined,
    design_end: undefined,
    construction_start: undefined,
    construction_end: undefined,
    // Meta
    description: '',
    notes: ''
  })

  // Pre-fill form from URL params (from ACC import)
  useEffect(() => {
    const name = searchParams.get('name')
    const number = searchParams.get('number')
    const address = searchParams.get('address')
    const client = searchParams.get('client')
    const type = searchParams.get('type')

    if (name || number || address || client || type) {
      setFromACC(true)
      setForm(prev => ({
        ...prev,
        name: name || prev.name,
        project_number: number || prev.project_number,
        address: address || prev.address,
        description: client ? `Client: ${client}` : prev.description,
        building_type: (type && BUILDING_TYPES.includes(type as BuildingType))
          ? type as BuildingType
          : prev.building_type
      }))
    }
  }, [searchParams])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target

    setForm(prev => ({
      ...prev,
      [name]: type === 'number'
        ? (value === '' ? undefined : parseFloat(value))
        : value || undefined
    }))
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPrimaryImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setPrimaryImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name.trim()) {
      setError('Project name is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      // Create the project
      const project = await createArchivedProject(form)

      // Upload primary image if provided
      if (primaryImage && project.id) {
        await uploadProjectMedia(project.id, primaryImage, 'image')
      }

      router.push(`/projects/${project.id}`)
    } catch (err) {
      console.error('Failed to create project:', err)
      setError('Failed to create project. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: '📋' },
    { id: 'location', label: 'Location & Zoning', icon: '📍' },
    { id: 'metrics', label: 'Metrics', icon: '📊' },
    { id: 'dates', label: 'Dates & Notes', icon: '📅' },
  ] as const

  return (
    <div className="max-w-4xl mx-auto">
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
            <h1 className="text-2xl font-bold text-gray-900">Add New Project</h1>
            <p className="text-gray-500 text-sm">Add a new project to the archive</p>
          </div>
        </div>
      </div>

      {/* ACC Import Notice */}
      {fromACC && (
        <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg text-orange-700 flex items-center gap-3">
          <span className="text-xl">🏗️</span>
          <div>
            <div className="font-medium">Imported from ACC</div>
            <div className="text-sm">Data extracted from Revit model. Please review and complete the form.</div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Tabs */}
        <div className="bg-white rounded-t-lg shadow border-b">
          <div className="flex">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-white rounded-b-lg shadow p-6">
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              {/* Primary Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Primary Image
                </label>
                <div className="flex items-start gap-4">
                  <div className="w-48 h-32 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                    {primaryImagePreview ? (
                      <img
                        src={primaryImagePreview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Recommended: 1600x900px or larger
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Project Name */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., The Grand Tower"
                  />
                </div>

                {/* Project Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project Number
                  </label>
                  <input
                    type="text"
                    name="project_number"
                    value={form.project_number || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., 2024-001"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {PROJECT_STATUSES.map(status => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Studio */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Studio
                  </label>
                  <select
                    name="studio"
                    value={form.studio || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select Studio</option>
                    {STUDIOS.map(studio => (
                      <option key={studio} value={studio}>{studio}</option>
                    ))}
                  </select>
                </div>

                {/* Building Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Building Type
                  </label>
                  <select
                    name="building_type"
                    value={form.building_type || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select Type</option>
                    {BUILDING_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {/* Sub Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sub Type
                  </label>
                  <input
                    type="text"
                    name="sub_type"
                    value={form.sub_type || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., High-Rise, Low-Rise"
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={form.description || ''}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Brief project description..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Location & Zoning Tab */}
          {activeTab === 'location' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Address */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={form.address || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Street address"
                  />
                </div>

                {/* City */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={form.city || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., Los Angeles"
                  />
                </div>

                {/* State */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={form.state || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., CA"
                  />
                </div>

                {/* Zip Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zip Code
                  </label>
                  <input
                    type="text"
                    name="zip_code"
                    value={form.zip_code || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., 90001"
                  />
                </div>

                {/* Coordinates */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    name="latitude"
                    value={form.latitude ?? ''}
                    onChange={handleChange}
                    step="0.000001"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., 34.0522"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    name="longitude"
                    value={form.longitude ?? ''}
                    onChange={handleChange}
                    step="0.000001"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., -118.2437"
                  />
                </div>
              </div>

              {/* Zoning Section */}
              <div className="pt-4 border-t">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Zoning Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Zoning Code */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Zoning Code
                    </label>
                    <input
                      type="text"
                      name="zoning_code"
                      value={form.zoning_code || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., R4-1"
                    />
                  </div>

                  {/* Zoning FAR */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Zoning FAR (Allowed)
                    </label>
                    <input
                      type="number"
                      name="zoning_far"
                      value={form.zoning_far ?? ''}
                      onChange={handleChange}
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 3.0"
                    />
                  </div>

                  {/* Site Area */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Site Area (sf)
                    </label>
                    <input
                      type="number"
                      name="site_area"
                      value={form.site_area ?? ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 15000"
                    />
                  </div>

                  {/* Setbacks */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Front Setback (ft)
                    </label>
                    <input
                      type="number"
                      name="setback_front"
                      value={form.setback_front ?? ''}
                      onChange={handleChange}
                      step="0.1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 10"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rear Setback (ft)
                    </label>
                    <input
                      type="number"
                      name="setback_rear"
                      value={form.setback_rear ?? ''}
                      onChange={handleChange}
                      step="0.1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 15"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Side Setback (ft)
                    </label>
                    <input
                      type="number"
                      name="setback_side"
                      value={form.setback_side ?? ''}
                      onChange={handleChange}
                      step="0.1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 5"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Metrics Tab */}
          {activeTab === 'metrics' && (
            <div className="space-y-6">
              {/* Area Metrics */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Area Metrics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Gross Area (sf)
                    </label>
                    <input
                      type="number"
                      name="gross_area"
                      value={form.gross_area ?? ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 250000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Net Area (sf)
                    </label>
                    <input
                      type="number"
                      name="net_area"
                      value={form.net_area ?? ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 200000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Actual FAR
                    </label>
                    <input
                      type="number"
                      name="far_actual"
                      value={form.far_actual ?? ''}
                      onChange={handleChange}
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 2.85"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Floor Count
                    </label>
                    <input
                      type="number"
                      name="floor_count"
                      value={form.floor_count ?? ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 25"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Building Height (ft)
                    </label>
                    <input
                      type="number"
                      name="building_height"
                      value={form.building_height ?? ''}
                      onChange={handleChange}
                      step="0.1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 280"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Efficiency Ratio (%)
                    </label>
                    <input
                      type="number"
                      name="efficiency_ratio"
                      value={form.efficiency_ratio ?? ''}
                      onChange={handleChange}
                      step="0.1"
                      min="0"
                      max="100"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 85"
                    />
                  </div>
                </div>
              </div>

              {/* Unit Metrics */}
              <div className="pt-4 border-t">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Unit Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit Count
                    </label>
                    <input
                      type="number"
                      name="unit_count"
                      value={form.unit_count ?? ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 200"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Avg Unit Size (sf)
                    </label>
                    <input
                      type="number"
                      name="avg_unit_size"
                      value={form.avg_unit_size ?? ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 850"
                    />
                  </div>
                </div>
              </div>

              {/* Parking Metrics */}
              <div className="pt-4 border-t">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Parking</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Parking Count
                    </label>
                    <input
                      type="number"
                      name="parking_count"
                      value={form.parking_count ?? ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 180"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Parking Ratio (per unit)
                    </label>
                    <input
                      type="number"
                      name="parking_ratio"
                      value={form.parking_ratio ?? ''}
                      onChange={handleChange}
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 0.9"
                    />
                  </div>
                </div>
              </div>

              {/* Cost Metrics */}
              <div className="pt-4 border-t">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Cost Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Construction Cost ($)
                    </label>
                    <input
                      type="number"
                      name="construction_cost"
                      value={form.construction_cost ?? ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 75000000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cost per SF ($/sf)
                    </label>
                    <input
                      type="number"
                      name="cost_per_sf"
                      value={form.cost_per_sf ?? ''}
                      onChange={handleChange}
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 300"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dates & Notes Tab */}
          {activeTab === 'dates' && (
            <div className="space-y-6">
              {/* Project Timeline */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Project Timeline</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Design Start
                    </label>
                    <input
                      type="date"
                      name="design_start"
                      value={form.design_start || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Design End
                    </label>
                    <input
                      type="date"
                      name="design_end"
                      value={form.design_end || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Construction Start
                    </label>
                    <input
                      type="date"
                      name="construction_start"
                      value={form.construction_start || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Construction End
                    </label>
                    <input
                      type="date"
                      name="construction_end"
                      value={form.construction_end || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="pt-4 border-t">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Additional Notes</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    value={form.notes || ''}
                    onChange={handleChange}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Any additional notes about this project..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-6 mt-6 border-t">
            <Link
              href="/projects"
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Create Project
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
