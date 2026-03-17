import { NextRequest, NextResponse } from 'next/server'
import { supabase, updateScript, addScriptScreenshot, deleteScriptScreenshot, getScriptScreenshots, getScript } from '@/lib/supabase'

/**
 * POST /api/scripts/upload
 * Upload thumbnail, screenshot, or 3D preview file for a script
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const scriptId = formData.get('scriptId') as string
    const fileType = formData.get('fileType') as 'thumbnail' | 'screenshot' | '3dm'
    const caption = formData.get('caption') as string | null

    if (!file || !scriptId || !fileType) {
      return NextResponse.json(
        { error: 'file, scriptId, and fileType are required' },
        { status: 400 }
      )
    }

    // File size validation (10MB max)
    const MAX_FILE_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is 10MB, got ${(file.size / 1024 / 1024).toFixed(1)}MB` },
        { status: 400 }
      )
    }

    // fileType validation
    const validFileTypes = ['thumbnail', 'screenshot', '3dm']
    if (!validFileTypes.includes(fileType)) {
      return NextResponse.json(
        { error: `fileType must be one of: ${validFileTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // MIME type validation
    if ((fileType === 'thumbnail' || fileType === 'screenshot') && file.type && !file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'thumbnail and screenshot must be image files' },
        { status: 400 }
      )
    }

    // Validate file type
    const fileName = file.name.toLowerCase()
    if (fileType === 'thumbnail' || fileType === 'screenshot') {
      if (!fileName.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        return NextResponse.json(
          { error: 'Image must be a valid image file (jpg, png, gif, webp)' },
          { status: 400 }
        )
      }
    } else if (fileType === '3dm') {
      if (!fileName.endsWith('.3dm')) {
        return NextResponse.json(
          { error: '3D preview must be a .3dm file' },
          { status: 400 }
        )
      }
    }

    // Generate storage path
    const timestamp = Date.now()
    const ext = fileName.split('.').pop()
    let storagePath: string

    if (fileType === 'thumbnail') {
      storagePath = `${scriptId}/thumbnail_${timestamp}.${ext}`
    } else if (fileType === 'screenshot') {
      storagePath = `${scriptId}/screenshots/screenshot_${timestamp}.${ext}`
    } else {
      storagePath = `${scriptId}/preview_${timestamp}.3dm`
    }

    // Convert File to ArrayBuffer then Uint8Array
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('scripts')
      .upload(storagePath, uint8Array, {
        contentType: file.type || (fileType === '3dm' ? 'application/octet-stream' : 'image/png'),
        upsert: true
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('scripts')
      .getPublicUrl(storagePath)

    // Handle based on file type
    if (fileType === 'screenshot') {
      // Check if this will be the first screenshot
      const existingScreenshots = await getScriptScreenshots(scriptId)
      const isFirstScreenshot = existingScreenshots.length === 0

      // Add to script_screenshots table
      const screenshot = await addScriptScreenshot(
        scriptId,
        publicUrl,
        storagePath,
        caption || undefined
      )

      // If first screenshot, also set as thumbnail for list view sync
      if (isFirstScreenshot) {
        await updateScript(scriptId, { thumbnail_url: publicUrl })
      }

      return NextResponse.json({
        success: true,
        url: publicUrl,
        storagePath,
        screenshotId: screenshot.id,
        fileType,
        scriptId,
        setAsThumbnail: isFirstScreenshot
      })
    } else {
      // Update script record for thumbnail or 3dm
      const updateField = fileType === 'thumbnail'
        ? { thumbnail_url: publicUrl }
        : { preview_3dm_url: publicUrl }

      await updateScript(scriptId, updateField)

      return NextResponse.json({
        success: true,
        url: publicUrl,
        storagePath,
        fileType,
        scriptId
      })
    }

  } catch (error) {
    console.error('Script upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/scripts/upload
 * Delete a screenshot and sync thumbnail if needed
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const screenshotId = searchParams.get('screenshotId')
    const scriptId = searchParams.get('scriptId')

    if (!screenshotId) {
      return NextResponse.json(
        { error: 'screenshotId is required' },
        { status: 400 }
      )
    }

    // Get the screenshot URL before deleting
    const { data: screenshotToDelete } = await supabase
      .from('script_screenshots')
      .select('url, script_id')
      .eq('id', screenshotId)
      .single()

    const targetScriptId = scriptId || screenshotToDelete?.script_id

    // Delete the screenshot
    await deleteScriptScreenshot(screenshotId)

    // If we know the script, sync the thumbnail
    if (targetScriptId && screenshotToDelete) {
      const script = await getScript(targetScriptId)

      // If the deleted screenshot was the thumbnail, update to next available
      if (script?.thumbnail_url === screenshotToDelete.url) {
        const remainingScreenshots = await getScriptScreenshots(targetScriptId)
        const newThumbnail = remainingScreenshots.length > 0
          ? remainingScreenshots[0].url
          : undefined

        await updateScript(targetScriptId, { thumbnail_url: newThumbnail })
      }
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Delete screenshot error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
