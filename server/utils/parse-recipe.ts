import type { H3Event } from 'h3'
import { getCloudflareAI, hasCloudflareAI } from './cloudflare-ai'

export interface ParsedRecipe {
  ingredients: string[]
  instructions: string
}

const RECIPE_PARSE_PROMPT = `You are a recipe parser. Given recipe text, extract ingredients and instructions.

Rules:
- INGREDIENTS: Extract each ingredient as a separate item, keeping quantities and units
- INSTRUCTIONS: Extract cooking steps, separated by newlines

Return ONLY valid JSON in this exact format:
{"ingredients":["ingredient 1","ingredient 2"],"instructions":"Step 1\\nStep 2\\nStep 3"}

Do not include any text before or after the JSON.`

/**
 * Parse recipe text using Cloudflare Workers AI to extract ingredients and instructions
 */
export async function parseRecipeWithAI(event: H3Event, content: string): Promise<ParsedRecipe | null> {
  if (!hasCloudflareAI(event)) {
    console.log('[parseRecipeWithAI] No AI binding available')
    return null
  }

  try {
    const ai = getCloudflareAI(event)
    console.log('[parseRecipeWithAI] Calling AI with content length:', content.length)

    const response = await ai.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: RECIPE_PARSE_PROMPT
        },
        {
          role: 'user',
          content: `Parse this recipe:\n\n${content}`
        }
      ]
    })

    console.log('[parseRecipeWithAI] Raw AI response:', JSON.stringify(response))

    const aiResult = response.response?.trim()
    if (!aiResult) {
      console.log('[parseRecipeWithAI] Empty AI response')
      return null
    }

    console.log('[parseRecipeWithAI] AI result text:', aiResult.slice(0, 1000))

    // Try to extract JSON from response (AI might add extra text)
    const jsonMatch = aiResult.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.log('[parseRecipeWithAI] No JSON found in AI response')
      return null
    }

    console.log('[parseRecipeWithAI] Extracted JSON:', jsonMatch[0].slice(0, 500))

    const parsed = JSON.parse(jsonMatch[0]) as ParsedRecipe

    // Validate structure
    if (!Array.isArray(parsed.ingredients) || typeof parsed.instructions !== 'string') {
      console.log('[parseRecipeWithAI] Invalid structure - ingredients:', typeof parsed.ingredients, 'instructions:', typeof parsed.instructions)
      return null
    }

    console.log('[parseRecipeWithAI] Successfully parsed - ingredients:', parsed.ingredients.length, 'instructions length:', parsed.instructions.length)

    return {
      ingredients: parsed.ingredients.filter(i => typeof i === 'string' && i.trim()),
      instructions: parsed.instructions.trim()
    }
  }
  catch (error) {
    console.error('[parseRecipeWithAI] Error:', error)
    return null
  }
}
