import type { Metadata } from 'next'
import './globals.css'
import Link from 'next/link'
import { ToastProvider } from '@/components/Toast'

export const metadata: Metadata = {
  title: 'Intelligent Design Systems',
  description: 'Computational Design Data Management Platform',
}

const NAV_ITEMS = [
  { href: '/scripts', label: 'GH Store', color: 'hover:text-emerald-600' },
  { href: '/design-lab', label: 'Design Lab', color: 'hover:text-blue-600' },
  { href: '/projects', label: 'Project DB', color: 'hover:text-purple-600' },
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <ToastProvider>
        <nav className="bg-white shadow-sm border-b sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 via-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">IDS</span>
                </div>
                <span className="text-lg font-bold text-gray-900">
                  Intelligent Design Systems
                </span>
              </Link>

              {/* Navigation */}
              <div className="flex items-center gap-6">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-sm font-medium text-gray-600 transition-colors ${item.color}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t bg-white mt-12">
          <div className="max-w-7xl mx-auto px-4 py-4 text-center text-xs text-gray-400">
            Computational Design | Supabase + Next.js
          </div>
        </footer>
        </ToastProvider>
      </body>
    </html>
  )
}
