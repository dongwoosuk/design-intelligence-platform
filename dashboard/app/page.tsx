'use client'

import { useEffect, useState } from 'react'
import { getDashboardStats, DashboardStats } from '@/lib/supabase'
import Link from 'next/link'

// Category Icons as SVG components
const ScriptIcon = () => (
  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
  </svg>
)

const IterationIcon = () => (
  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
  </svg>
)

const ProjectIcon = () => (
  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
)

interface CategoryCard {
  id: string
  title: string
  subtitle: string
  description: string
  icon: React.ReactNode
  href: string
  color: string
  bgColor: string
  stats: { label: string; value: number | string }[]
}

export default function Home() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const data = await getDashboardStats()
        setStats(data)
      } catch (error) {
        console.error('Failed to load stats:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const categories: CategoryCard[] = [
    {
      id: 'scripts',
      title: 'GH Store',
      subtitle: 'Tool Warehouse',
      description: 'GH script versioning, documentation, and firm-wide sharing',
      icon: <ScriptIcon />,
      href: '/scripts',
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200',
      stats: [
        { label: 'Scripts', value: stats?.scripts.total || 0 },
        { label: 'Categories', value: Object.keys(stats?.scripts.byCategory || {}).length },
      ]
    },
    {
      id: 'iterations',
      title: 'Design Lab',
      subtitle: 'Lab Records',
      description: 'Save design options, track parameters, analyze performance',
      icon: <IterationIcon />,
      href: '/design-lab',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      stats: [
        { label: 'Options', value: stats?.iterations.total || 0 },
        { label: 'Selected', value: stats?.iterations.selected || 0 },
        { label: 'Active Projects', value: stats?.iterations.recentProjects || 0 },
      ]
    },
    {
      id: 'projects',
      title: 'Project DB',
      subtitle: 'Firm Memory',
      description: 'Project metadata, decision history, and benchmarking',
      icon: <ProjectIcon />,
      href: '/projects',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
      stats: [
        { label: 'Projects', value: stats?.projects.total || 0 },
        { label: 'Active', value: stats?.projects.active || 0 },
        { label: 'Completed', value: stats?.projects.completed || 0 },
      ]
    },
  ]

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Intelligent Design Systems
        </h1>
        <p className="text-gray-500">
          Computational Design Data Management Platform
        </p>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-100 rounded-xl h-64 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Category Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={cat.href}
                className={`block rounded-xl border-2 p-6 transition-all duration-200 ${cat.bgColor}`}
              >
                {/* Icon & Title */}
                <div className={`${cat.color} mb-4`}>
                  {cat.icon}
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">
                  {cat.title}
                </h2>
                <p className="text-sm text-gray-500 mb-2">
                  {cat.subtitle}
                </p>
                <p className="text-sm text-gray-600 mb-4">
                  {cat.description}
                </p>

                {/* Stats */}
                <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
                  {cat.stats.map((stat) => (
                    <div key={stat.label} className="text-center">
                      <div className={`text-2xl font-bold ${cat.color}`}>
                        {stat.value}
                      </div>
                      <div className="text-xs text-gray-500">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>

          {/* System Architecture Diagram */}
          <div className="bg-gray-900 rounded-xl p-6 text-gray-300 font-mono text-sm">
            <div className="text-center mb-4 text-gray-500">System Architecture</div>
            <pre className="overflow-x-auto">
{`┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │
│  GH STORE   │────▶│ DESIGN LAB  │────▶│ PROJECT DB  │
│             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
   Tool Sharing       Option Testing      Knowledge Base
   GH Scripts         Massing Study       Case Archive
   Firmwide           Optimization        ML Analysis`}
            </pre>
          </div>

          {/* Quick Stats Footer */}
          <div className="mt-8 grid grid-cols-4 gap-4 text-center">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-3xl font-bold text-gray-900">
                {(stats?.scripts.total || 0) + (stats?.iterations.total || 0) + (stats?.projects.total || 0)}
              </div>
              <div className="text-xs text-gray-500">Total Records</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-3xl font-bold text-gray-900">
                {stats?.iterations.selected || 0}
              </div>
              <div className="text-xs text-gray-500">Selected Options</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-3xl font-bold text-gray-900">
                {stats?.projects.active || 0}
              </div>
              <div className="text-xs text-gray-500">Active Projects</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-3xl font-bold text-emerald-600">
                {stats?.scripts.total || 0}
              </div>
              <div className="text-xs text-gray-500">Shared Scripts</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
