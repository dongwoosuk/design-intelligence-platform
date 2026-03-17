import { NextRequest, NextResponse } from 'next/server'
import { getScript, updateScript } from '@/lib/supabase'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = 'gemini-2.5-flash-lite'

interface DescribeInput {
  name?: string
  category?: string
  subcategory?: string
  inputs?: Array<{ name: string; type: string; description?: string }>
  outputs?: Array<{ name: string; type: string; description?: string }>
  dependencies?: string[]
  tags?: string[]
  existingDescription?: string
}

/**
 * Call Gemini API
 */
async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        }
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Gemini API error: ${error.error?.message || JSON.stringify(error)}`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
}

/**
 * Generate AI description using Gemini
 */
async function generateDescription(input: DescribeInput): Promise<string> {
  const inputsText = input.inputs?.map(i =>
    `- ${i.name} (${i.type})${i.description ? `: ${i.description}` : ''}`
  ).join('\n') || 'None specified'

  const outputsText = input.outputs?.map(o =>
    `- ${o.name} (${o.type})${o.description ? `: ${o.description}` : ''}`
  ).join('\n') || 'None specified'

  const prompt = `You are a technical writer for a Grasshopper script library.
Generate a clear, concise description for a Grasshopper definition based on its metadata.
The description should explain:
1. What the script does (main purpose)
2. Key inputs and what they control
3. Expected outputs
4. Use cases or when to use this script

Keep it professional but approachable. Use 2-4 sentences.
Write in English unless the input contains Korean, then respond in Korean.

Script Metadata:
Name: ${input.name || 'Unnamed'}
Category: ${input.category || 'Other'}${input.subcategory ? ` / ${input.subcategory}` : ''}

Inputs:
${inputsText}

Outputs:
${outputsText}

${input.dependencies?.length ? `Required Plugins: ${input.dependencies.join(', ')}` : ''}
${input.tags?.length ? `Tags: ${input.tags.join(', ')}` : ''}
${input.existingDescription ? `\nExisting description (improve on this): ${input.existingDescription}` : ''}

Generate the description:`

  return await callGemini(prompt)
}

/**
 * Generate "What you can do with this script" suggestions
 */
async function generateUseCases(input: DescribeInput): Promise<string[]> {
  const prompt = `You are a Grasshopper expert.
Based on the script metadata, suggest 3-5 specific things a user can do with this script.
Format each suggestion as a short action phrase starting with a verb.
Return ONLY a JSON array of strings, no other text.
Example: ["Generate multiple massing options quickly", "Test different floor plate sizes", "Export results to Excel"]

Script Info:
Name: ${input.name || 'Unnamed'}
Category: ${input.category || 'Other'}
Description: ${input.existingDescription || 'No description'}
Inputs: ${input.inputs?.map(i => i.name).join(', ') || 'None'}
Outputs: ${input.outputs?.map(o => o.name).join(', ') || 'None'}
Plugins: ${input.dependencies?.join(', ') || 'None'}

Return ONLY the JSON array:`

  const content = await callGemini(prompt)

  try {
    // Try to parse JSON array from response
    const match = content.match(/\[[\s\S]*\]/)
    if (match) {
      return JSON.parse(match[0])
    }
    return []
  } catch {
    // If parsing fails, split by newlines and clean up
    return content.split('\n')
      .map((line: string) => line.replace(/^[-*•\d.]\s*/, '').trim())
      .filter((line: string) => line.length > 0 && !line.startsWith('[') && !line.startsWith(']'))
      .slice(0, 5)
  }
}

/**
 * POST /api/ai-describe
 * Generate AI description or use cases for a script
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, scriptId, metadata } = body

    // Input validation
    const validActions = ['describe', 'use-cases', 'both']
    if (!action || !validActions.includes(action)) {
      return NextResponse.json({ error: `action must be one of: ${validActions.join(', ')}` }, { status: 400 })
    }
    if (scriptId !== undefined && (typeof scriptId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scriptId))) {
      return NextResponse.json({ error: 'scriptId must be a valid UUID' }, { status: 400 })
    }

    // Get script metadata either from ID or directly from request
    let input: DescribeInput

    if (scriptId) {
      const script = await getScript(scriptId)
      if (!script) {
        return NextResponse.json({ error: 'Script not found' }, { status: 404 })
      }
      input = {
        name: script.name,
        category: script.category,
        subcategory: script.subcategory,
        inputs: script.inputs,
        outputs: script.outputs,
        dependencies: script.dependencies,
        tags: script.tags,
        existingDescription: script.description,
      }
    } else if (metadata) {
      input = metadata
    } else {
      return NextResponse.json({ error: 'scriptId or metadata is required' }, { status: 400 })
    }

    if (action === 'describe') {
      // Generate description
      const description = await generateDescription(input)

      // Optionally save to database
      if (scriptId && body.save) {
        await updateScript(scriptId, { description })
      }

      return NextResponse.json({
        success: true,
        description,
        saved: !!body.save,
        model: GEMINI_MODEL
      })

    } else if (action === 'use-cases') {
      // Generate use cases
      const useCases = await generateUseCases(input)

      return NextResponse.json({
        success: true,
        useCases,
        model: GEMINI_MODEL
      })

    } else if (action === 'both') {
      // Generate both description and use cases
      const [description, useCases] = await Promise.all([
        generateDescription(input),
        generateUseCases(input)
      ])

      if (scriptId && body.save) {
        await updateScript(scriptId, { description })
      }

      return NextResponse.json({
        success: true,
        description,
        useCases,
        saved: !!body.save,
        model: GEMINI_MODEL
      })

    } else {
      return NextResponse.json({ error: 'Invalid action. Use: describe, use-cases, or both' }, { status: 400 })
    }

  } catch (error) {
    console.error('AI Describe API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ai-describe?action=status
 * Check if AI description is available
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'status') {
      return NextResponse.json({
        configured: !!GEMINI_API_KEY,
        model: GEMINI_MODEL,
        features: ['describe', 'use-cases'],
        provider: 'gemini'
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('AI Describe API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
