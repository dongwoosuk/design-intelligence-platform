import { NextRequest, NextResponse } from 'next/server'
import { reorderScriptScreenshots, getScriptScreenshots, updateScript, getScript } from '@/lib/supabase'

/**
 * POST /api/scripts/reorder
 * Reorder screenshots and update thumbnail to first screenshot
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { scriptId, screenshotIds } = body

    if (!scriptId || !screenshotIds || !Array.isArray(screenshotIds)) {
      return NextResponse.json(
        { error: 'scriptId and screenshotIds array are required' },
        { status: 400 }
      )
    }

    // Validate screenshotIds entries are UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (screenshotIds.length === 0 || screenshotIds.length > 100) {
      return NextResponse.json(
        { error: 'screenshotIds must contain 1-100 items' },
        { status: 400 }
      )
    }
    if (!screenshotIds.every((id: unknown) => typeof id === 'string' && uuidRegex.test(id))) {
      return NextResponse.json(
        { error: 'All screenshotIds must be valid UUIDs' },
        { status: 400 }
      )
    }

    // Reorder screenshots in database
    await reorderScriptScreenshots(screenshotIds)

    // Get the reordered screenshots to find the first one
    const screenshots = await getScriptScreenshots(scriptId)

    // Update thumbnail_url to match the first screenshot
    if (screenshots.length > 0) {
      const firstScreenshot = screenshots[0]
      await updateScript(scriptId, { thumbnail_url: firstScreenshot.url })
    }

    // Get updated script
    const updatedScript = await getScript(scriptId)

    return NextResponse.json({
      success: true,
      thumbnailUrl: updatedScript?.thumbnail_url || null
    })

  } catch (error) {
    console.error('Reorder screenshots error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
