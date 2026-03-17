'use client'

import { useEffect, useState, Suspense } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Center, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
// @ts-ignore
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js'

interface Viewer3DProps {
  geometryUrl: string | null
  onClose: () => void
}

type DisplayMode = 'solid' | 'ghost'

// Geometry loader component
function RhinoGeometry({ url, onStatus, displayMode }: { url: string; onStatus: (msg: string) => void; displayMode: DisplayMode }) {
  const [object, setObject] = useState<THREE.Object3D | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadGeometry() {
      try {
        onStatus('Loading 3D model...')
        console.log('Loading with Rhino3dmLoader:', url)

        const loader = new Rhino3dmLoader()
        loader.setLibraryPath('/rhino3dm/')

        loader.load(
          url,
          (loadedObject) => {
            console.log('Model loaded:', loadedObject)
            console.log('Children:', loadedObject.children.length)

            // Rhino Z-up → Three.js Y-up conversion
            loadedObject.rotation.x = -Math.PI / 2

            // Default material setup
            loadedObject.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.material = new THREE.MeshStandardMaterial({
                  color: 0x888888,
                  metalness: 0.3,
                  roughness: 0.6,
                  side: THREE.DoubleSide
                })
              }
            })

            // Adjust so bottom sits on grid (Y=0)
            loadedObject.updateMatrixWorld(true)
            const box = new THREE.Box3().setFromObject(loadedObject)
            const yOffset = -box.min.y  // Move object bottom to Y=0
            loadedObject.position.y += yOffset
            console.log('Bounding box:', box.min, box.max, 'Y offset:', yOffset)

            setObject(loadedObject)
            onStatus(`Loaded ${loadedObject.children.length} objects`)
            setLoading(false)
          },
          (progress) => {
            if (progress.total > 0) {
              const pct = Math.round((progress.loaded / progress.total) * 100)
              onStatus(`Loading... ${pct}%`)
            }
          },
          (err) => {
            console.error('Load error:', err)
            setError(err instanceof Error ? err.message : 'Load failed')
            onStatus('Error loading model')
            setLoading(false)
          }
        )
      } catch (err) {
        console.error('Error:', err)
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        setError(errMsg)
        onStatus(`Error: ${errMsg}`)
        setLoading(false)
      }
    }

    loadGeometry()
  }, [url, onStatus])

  // Update materials when displayMode changes
  useEffect(() => {
    if (!object) return

    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Remove previously added LineSegments
        const toRemove: THREE.Object3D[] = []
        child.children.forEach((c) => {
          if (c instanceof THREE.LineSegments) {
            toRemove.push(c)
          }
        })
        toRemove.forEach((c) => child.remove(c))

        switch (displayMode) {
          case 'ghost':
            // Semi-transparent ghost material
            child.material = new THREE.MeshStandardMaterial({
              color: 0xcccccc,
              metalness: 0.1,
              roughness: 0.8,
              transparent: true,
              opacity: 0.3,
              side: THREE.DoubleSide
            })
            // Add edge lines
            const edges = new THREE.EdgesGeometry(child.geometry, 15)
            const line = new THREE.LineSegments(
              edges,
              new THREE.LineBasicMaterial({ color: 0x000000 })
            )
            child.add(line)
            break
          case 'solid':
          default:
            // Near-white solid material
            child.material = new THREE.MeshStandardMaterial({
              color: 0xf0f0f0,
              metalness: 0.1,
              roughness: 0.7,
              side: THREE.DoubleSide
            })
            // Add edge lines in solid mode too
            const solidEdges = new THREE.EdgesGeometry(child.geometry, 15)
            const solidLine = new THREE.LineSegments(
              solidEdges,
              new THREE.LineBasicMaterial({ color: 0x000000 })
            )
            child.add(solidLine)
            break
        }
      }
    })
  }, [object, displayMode])

  if (loading) return null
  if (error) return null
  if (!object) return null

  return <primitive object={object} />
}

// Auto-adjust camera
function CameraController() {
  const { camera, scene } = useThree()

  useEffect(() => {
    // Compute scene bounding box
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    // Adjust camera position
    const maxDim = Math.max(size.x, size.y, size.z)
    const distance = maxDim * 2

    camera.position.set(center.x + distance, center.y + distance * 0.5, center.z + distance)
    camera.lookAt(center)
    camera.updateProjectionMatrix()
  }, [camera, scene])

  return null
}

export default function Viewer3D({ geometryUrl, onClose }: Viewer3DProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('solid')
  const [status, setStatus] = useState('Initializing...')

  if (!geometryUrl) return null

  const modeButtons: { mode: DisplayMode; label: string }[] = [
    { mode: 'solid', label: 'Solid' },
    { mode: 'ghost', label: 'Ghost' },
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-900">
        <div className="flex items-center gap-4">
          <h2 className="text-white font-semibold">3D Viewer</h2>
          <span className="text-gray-400 text-sm">{status}</span>
          <div className="flex gap-1">
            {modeButtons.map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setDisplayMode(mode)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  displayMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:text-gray-300 text-2xl font-bold w-10 h-10 flex items-center justify-center"
        >
          ×
        </button>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1">
        <Canvas>
          <PerspectiveCamera makeDefault position={[10, 10, 10]} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <directionalLight position={[-10, -10, -5]} intensity={0.3} />

          <Suspense fallback={null}>
            <RhinoGeometry url={geometryUrl} onStatus={setStatus} displayMode={displayMode} />
          </Suspense>

          <OrbitControls enableDamping dampingFactor={0.1} />
          <CameraController />

          {/* Grid */}
          <gridHelper args={[100, 100, '#444444', '#333333']} />
        </Canvas>
      </div>

      {/* Control instructions */}
      <div className="p-2 bg-gray-900 text-gray-400 text-xs text-center">
        Left-drag: Rotate | Right-drag: Pan | Scroll: Zoom
      </div>
    </div>
  )
}
