import { NextRequest, NextResponse } from 'next/server'
import {
  getScript,
  generateEmbeddingText,
  storeScriptEmbedding,
  searchScriptsBySimilarity,
  getScripts
} from '@/lib/supabase'

// Local embedding model configuration
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'
const EMBEDDING_DIMENSION = 384

// Lazy-load the pipeline to avoid loading on every request
let embeddingPipeline: any = null

/**
 * Get or initialize the embedding pipeline
 */
async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    // Dynamic import to avoid issues with SSR
    const { pipeline } = await import('@xenova/transformers')
    embeddingPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL)
  }
  return embeddingPipeline
}

/**
 * Generate embedding using local transformers.js model
 * Returns 384-dimensional vector (all-MiniLM-L6-v2)
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline()

  // Generate embedding
  const output = await pipe(text, { pooling: 'mean', normalize: true })

  // Convert to array
  const embedding = Array.from(output.data) as number[]

  // Ensure correct dimension
  if (embedding.length !== EMBEDDING_DIMENSION) {
    console.warn(`Expected ${EMBEDDING_DIMENSION} dimensions, got ${embedding.length}`)
  }

  return embedding
}

/**
 * POST /api/embeddings
 * Generate and store embedding for a script, or search by query
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, scriptId, query, threshold, limit } = body

    // Input validation
    if (typeof query === 'string' && query.length > 500) {
      return NextResponse.json({ error: 'query must be 500 characters or less' }, { status: 400 })
    }
    if (threshold !== undefined && (typeof threshold !== 'number' || threshold < 0 || threshold > 1)) {
      return NextResponse.json({ error: 'threshold must be a number between 0 and 1' }, { status: 400 })
    }
    if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > 100 || !Number.isInteger(limit))) {
      return NextResponse.json({ error: 'limit must be an integer between 1 and 100' }, { status: 400 })
    }

    if (action === 'generate') {
      // Generate embedding for a specific script
      if (!scriptId) {
        return NextResponse.json({ error: 'scriptId is required' }, { status: 400 })
      }

      const script = await getScript(scriptId)
      if (!script) {
        return NextResponse.json({ error: 'Script not found' }, { status: 404 })
      }

      // Generate text to embed
      const embeddingText = generateEmbeddingText(script)

      // Generate embedding using local model
      const embedding = await generateEmbedding(embeddingText)

      // Store embedding
      await storeScriptEmbedding(scriptId, embedding, embeddingText, EMBEDDING_MODEL)

      return NextResponse.json({
        success: true,
        scriptId,
        embeddingLength: embedding.length,
        textLength: embeddingText.length,
        model: EMBEDDING_MODEL
      })

    } else if (action === 'search') {
      // Semantic search
      if (!query) {
        return NextResponse.json({ error: 'query is required' }, { status: 400 })
      }

      // Generate embedding for query using local model
      const queryEmbedding = await generateEmbedding(query)

      // Search by similarity
      const results = await searchScriptsBySimilarity(
        queryEmbedding,
        threshold || 0.3,
        limit || 10
      )

      // Get full script details for results
      const { data: allScripts } = await getScripts()
      const scriptMap = new Map(allScripts.map(s => [s.id, s]))

      const enrichedResults = results.map(r => ({
        ...r,
        script: scriptMap.get(r.script_id)
      }))

      return NextResponse.json({
        success: true,
        query,
        results: enrichedResults,
        model: EMBEDDING_MODEL
      })

    } else if (action === 'generate-all') {
      // Generate embeddings for all scripts
      const { data: scripts } = await getScripts()
      const results: Array<{ scriptId: string; success: boolean; error?: string }> = []

      for (const script of scripts) {
        try {
          const embeddingText = generateEmbeddingText(script)
          const embedding = await generateEmbedding(embeddingText)
          await storeScriptEmbedding(script.id, embedding, embeddingText, EMBEDDING_MODEL)
          results.push({ scriptId: script.id, success: true })
        } catch (error) {
          results.push({
            scriptId: script.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      return NextResponse.json({
        success: true,
        total: scripts.length,
        results,
        model: EMBEDDING_MODEL
      })

    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Embedding API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/embeddings?action=status
 * Check embedding status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'status') {
      return NextResponse.json({
        configured: true,  // Local model always available
        model: EMBEDDING_MODEL,
        dimension: EMBEDDING_DIMENSION,
        type: 'local'
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('Embedding API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
