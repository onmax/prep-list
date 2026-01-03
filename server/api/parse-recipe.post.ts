import { parseRecipeWithAI } from '../utils/parse-recipe'
import { hasCloudflareAI } from '../utils/cloudflare-ai'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const content = body?.content

  console.log('[parse-recipe] Received content length:', content?.length || 0)
  console.log('[parse-recipe] Content preview:', content?.slice(0, 500))

  if (!content || typeof content !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'content is required'
    })
  }

  if (content.length > 50000) {
    throw createError({
      statusCode: 400,
      message: 'Content too long (max 50000 characters)'
    })
  }

  // Check if AI is available (not available in local dev)
  const hasAI = hasCloudflareAI(event)
  console.log('[parse-recipe] AI binding available:', hasAI)

  if (!hasAI) {
    throw createError({
      statusCode: 503,
      message: 'AI parsing not available locally. Deploy to Cloudflare to use this feature, or enter the recipe manually.'
    })
  }

  const parsed = await parseRecipeWithAI(event, content)
  console.log('[parse-recipe] AI parsing result:', parsed)

  if (!parsed) {
    throw createError({
      statusCode: 500,
      message: 'Failed to parse recipe. Please try again or enter manually.'
    })
  }

  return {
    ingredients: parsed.ingredients,
    instructions: parsed.instructions
  }
})
