'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import { ScriptScreenshot } from '@/lib/supabase'

interface ImageGalleryProps {
  screenshots: ScriptScreenshot[]
  onUpload?: () => void
  onDelete?: (id: string) => void
  onReorder?: (screenshotIds: string[]) => void
  editable?: boolean
}

export default function ImageGallery({
  screenshots,
  onUpload,
  onDelete,
  onReorder,
  editable = false
}: ImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showViewer, setShowViewer] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)

  // Zoom/Pan state
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Reset zoom/pan when image changes
  useEffect(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [viewerIndex])

  // Reset index when screenshots change
  useEffect(() => {
    if (currentIndex >= screenshots.length) {
      setCurrentIndex(Math.max(0, screenshots.length - 1))
    }
  }, [screenshots.length, currentIndex])

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : screenshots.length - 1))
  }, [screenshots.length])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < screenshots.length - 1 ? prev + 1 : 0))
  }, [screenshots.length])

  const openViewer = (index: number) => {
    setViewerIndex(index)
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setShowViewer(true)
  }

  const closeViewer = () => {
    setShowViewer(false)
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale((prev) => Math.min(Math.max(0.5, prev + delta), 5))
  }, [])

  // Handle mouse down for panning
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }, [scale, position])

  // Handle mouse move for panning
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }, [isDragging, dragStart])

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Handle double click to toggle zoom
  const handleDoubleClick = useCallback(() => {
    if (scale === 1) {
      setScale(2)
    } else {
      setScale(1)
      setPosition({ x: 0, y: 0 })
    }
  }, [scale])

  // Zoom controls - stop propagation to prevent double-click trigger
  const zoomIn = (e: React.MouseEvent) => {
    e.stopPropagation()
    setScale((prev) => Math.min(prev + 0.5, 5))
  }
  const zoomOut = (e: React.MouseEvent) => {
    e.stopPropagation()
    setScale((prev) => Math.max(prev - 0.5, 0.5))
  }
  const resetZoom = (e: React.MouseEvent) => {
    e.stopPropagation()
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  // Move screenshot left in order
  const moveLeft = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (index === 0 || !onReorder) return
    const newOrder = [...screenshots]
    const temp = newOrder[index]
    newOrder[index] = newOrder[index - 1]
    newOrder[index - 1] = temp
    onReorder(newOrder.map(s => s.id))
    // Update current index if we moved the current image
    if (currentIndex === index) {
      setCurrentIndex(index - 1)
    } else if (currentIndex === index - 1) {
      setCurrentIndex(index)
    }
  }, [screenshots, onReorder, currentIndex])

  // Move screenshot right in order
  const moveRight = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (index === screenshots.length - 1 || !onReorder) return
    const newOrder = [...screenshots]
    const temp = newOrder[index]
    newOrder[index] = newOrder[index + 1]
    newOrder[index + 1] = temp
    onReorder(newOrder.map(s => s.id))
    // Update current index if we moved the current image
    if (currentIndex === index) {
      setCurrentIndex(index + 1)
    } else if (currentIndex === index + 1) {
      setCurrentIndex(index)
    }
  }, [screenshots, onReorder, currentIndex])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showViewer) {
        if (e.key === 'Escape') closeViewer()
        if (e.key === 'ArrowLeft') setViewerIndex((prev) => (prev > 0 ? prev - 1 : screenshots.length - 1))
        if (e.key === 'ArrowRight') setViewerIndex((prev) => (prev < screenshots.length - 1 ? prev + 1 : 0))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showViewer, screenshots.length])

  if (screenshots.length === 0) {
    return (
      <div className="relative aspect-video bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-400 text-sm">No screenshots yet</p>
          {editable && onUpload && (
            <button
              onClick={onUpload}
              className="mt-3 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
            >
              Upload Screenshot
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Main Gallery */}
      <div className="relative">
        {/* Main Image */}
        <div
          className="relative aspect-video bg-gray-900 rounded-xl overflow-hidden cursor-zoom-in group"
          onClick={() => openViewer(currentIndex)}
        >
          <Image
            src={screenshots[currentIndex]?.url || ''}
            alt={screenshots[currentIndex]?.caption || `Screenshot ${currentIndex + 1}`}
            fill
            className="object-contain"
            priority
          />

          {/* Zoom hint */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white px-4 py-2 rounded-lg flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
              Click to zoom
            </div>
          </div>

          {/* Caption */}
          {screenshots[currentIndex]?.caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
              <p className="text-white text-sm">{screenshots[currentIndex].caption}</p>
            </div>
          )}

          {/* Navigation Arrows */}
          {screenshots.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); goToPrevious() }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); goToNext() }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}

          {/* Image counter */}
          <div className="absolute top-3 right-3 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
            {currentIndex + 1} / {screenshots.length}
          </div>

          {/* Upload button (edit mode) */}
          {editable && onUpload && (
            <button
              onClick={(e) => { e.stopPropagation(); onUpload() }}
              className="absolute top-3 left-3 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
          )}
        </div>

        {/* Thumbnail Strip */}
        {screenshots.length > 1 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
            {screenshots.map((screenshot, index) => (
              <div key={screenshot.id} className="relative flex-shrink-0 group/thumb">
                <button
                  onClick={() => setCurrentIndex(index)}
                  className={`relative w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                    index === currentIndex
                      ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                      : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <Image
                    src={screenshot.url}
                    alt={screenshot.caption || `Thumbnail ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                  {/* First image badge (thumbnail indicator) */}
                  {index === 0 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-emerald-600/90 text-white text-[10px] text-center py-0.5">
                      Thumbnail
                    </div>
                  )}
                </button>

                {/* Edit mode controls */}
                {editable && (
                  <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                    {/* Delete button */}
                    {onDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(screenshot.id)
                        }}
                        className="w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow"
                        title="Delete"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}

                {/* Reorder controls (visible on hover in edit mode) */}
                {editable && onReorder && screenshots.length > 1 && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                    {/* Move left button */}
                    {index > 0 && (
                      <button
                        onClick={(e) => moveLeft(index, e)}
                        className="w-5 h-5 bg-gray-700/90 hover:bg-gray-600 text-white rounded flex items-center justify-center shadow"
                        title="Move left"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                    )}
                    {/* Move right button */}
                    {index < screenshots.length - 1 && (
                      <button
                        onClick={(e) => moveRight(index, e)}
                        className="w-5 h-5 bg-gray-700/90 hover:bg-gray-600 text-white rounded flex items-center justify-center shadow"
                        title="Move right"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full Screen Zoom Viewer - CSS Based */}
      {showViewer && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
          {/* Viewer Header */}
          <div className="flex items-center justify-between p-4 bg-black/50 z-20">
            <div className="flex items-center gap-4">
              <span className="text-white text-sm">
                {viewerIndex + 1} / {screenshots.length}
              </span>
              {screenshots[viewerIndex]?.caption && (
                <span className="text-gray-400 text-sm">
                  {screenshots[viewerIndex].caption}
                </span>
              )}
              <span className="text-gray-500 text-xs">
                {Math.round(scale * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Download button */}
              <a
                href={screenshots[viewerIndex]?.url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Download"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
              {/* Close button */}
              <button
                onClick={closeViewer}
                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Pan/Zoom Image Container */}
          <div
            ref={containerRef}
            className="flex-1 relative overflow-hidden flex items-center justify-center"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            style={{ cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-in' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={viewerIndex}
              src={screenshots[viewerIndex]?.url}
              alt={screenshots[viewerIndex]?.caption || 'Screenshot'}
              style={{
                maxWidth: '90vw',
                maxHeight: '80vh',
                objectFit: 'contain',
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                userSelect: 'none',
                pointerEvents: 'none'
              }}
              draggable={false}
            />

            {/* Zoom Controls */}
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/50 rounded-lg p-2"
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={(e) => zoomOut(e)}
                className="p-2 text-white hover:bg-white/10 rounded"
                title="Zoom Out"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                </svg>
              </button>
              <button
                onClick={(e) => resetZoom(e)}
                className="px-3 py-1 text-white text-sm hover:bg-white/10 rounded"
                title="Reset"
              >
                Reset
              </button>
              <button
                onClick={(e) => zoomIn(e)}
                className="p-2 text-white hover:bg-white/10 rounded"
                title="Zoom In"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </button>
            </div>

            {/* Navigation Arrows */}
            {screenshots.length > 1 && (
              <>
                <button
                  onClick={() => setViewerIndex((prev) => (prev > 0 ? prev - 1 : screenshots.length - 1))}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors z-10"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewerIndex((prev) => (prev < screenshots.length - 1 ? prev + 1 : 0))}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors z-10"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* Thumbnail Strip in Viewer */}
          {screenshots.length > 1 && (
            <div className="p-4 bg-black/50 z-20">
              <div className="flex gap-2 justify-center overflow-x-auto">
                {screenshots.map((screenshot, index) => (
                  <button
                    key={screenshot.id}
                    onClick={() => setViewerIndex(index)}
                    className={`relative flex-shrink-0 w-16 h-12 rounded overflow-hidden border-2 transition-all ${
                      index === viewerIndex
                        ? 'border-white'
                        : 'border-transparent opacity-50 hover:opacity-100'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={screenshot.url}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Help text */}
          <div className="absolute bottom-20 left-4 text-gray-500 text-xs z-10">
            <span>Scroll to zoom • Drag to pan • Double-click to toggle zoom • Arrow keys to navigate</span>
          </div>
        </div>
      )}
    </>
  )
}
