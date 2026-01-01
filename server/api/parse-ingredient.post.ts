import { parseIngredientLocal } from '../utils/parse-ingredient'
import { getCloudflareAI, hasCloudflareAI } from '../utils/cloudflare-ai'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const ingredient = body?.ingredient

  if (!ingredient || typeof ingredient !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'ingredient is required'
    })
  }

  // Try regex parsing first (fast, free)
  const localResult = parseIngredientLocal(ingredient)
  if (localResult) {
    return {
      item: localResult,
      original: ingredient,
      usedAI: false
    }
  }

  // Fallback to Workers AI if available
  if (hasCloudflareAI(event)) {
    try {
      const ai = getCloudflareAI(event)
      const response = await ai.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          {
            role: 'system',
            content: 'You extract ingredient names from recipe ingredients. Reply with ONLY the main ingredient name, nothing else. No quantities, no units, no preparation instructions.'
          },
          {
            role: 'user',
            content: `Extract the ingredient name from: "${ingredient}"`
          }
        ]
      })

      const aiResult = response.response?.trim()
      if (aiResult && aiResult.length > 0 && aiResult.length < ingredient.length) {
        return {
          item: aiResult,
          original: ingredient,
          usedAI: true
        }
      }
    }
    catch (error) {
      console.error('Workers AI parsing failed:', error)
      // Fall through to return original
    }
  }

  // Last resort: return original ingredient
  return {
    item: ingredient.trim(),
    original: ingredient,
    usedAI: false
  }
})
