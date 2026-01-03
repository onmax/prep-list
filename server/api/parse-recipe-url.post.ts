import { parseRecipeWithAI } from '../utils/parse-recipe'

interface SchemaRecipe {
  '@type': string | string[]
  name?: string
  recipeIngredient?: string[]
  recipeInstructions?: string | Array<string | { '@type': string, text?: string, name?: string }>
}

/**
 * Extract JSON-LD Recipe schema from HTML
 */
function extractRecipeSchema(html: string): SchemaRecipe | null {
  // Find all JSON-LD scripts
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const jsonContent = match[1].trim()
      const data = JSON.parse(jsonContent)

      // Handle @graph array (common pattern)
      const items = data['@graph'] || (Array.isArray(data) ? data : [data])

      for (const item of items) {
        const type = item['@type']
        if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) {
          return item as SchemaRecipe
        }
      }
    }
    catch {
      // Invalid JSON, continue to next script
    }
  }

  return null
}

/**
 * Parse recipe instructions from various schema formats
 */
function parseInstructions(instructions: SchemaRecipe['recipeInstructions']): string {
  if (!instructions) return ''

  if (typeof instructions === 'string') {
    return instructions
  }

  if (Array.isArray(instructions)) {
    return instructions
      .map((step, index) => {
        if (typeof step === 'string') {
          return step
        }
        // HowToStep or HowToSection
        return step.text || step.name || ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

/**
 * Extract plain text from HTML for fallback AI parsing
 */
function extractTextFromHtml(html: string): string {
  // Remove scripts, styles, and other non-content elements
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')

  // Replace block elements with newlines
  text = text.replace(/<(p|div|br|li|h[1-6])[^>]*>/gi, '\n')

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Clean up whitespace
  text = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')

  // Limit length for AI processing
  return text.slice(0, 30000)
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const url = body?.url

  if (!url || typeof url !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'URL is required'
    })
  }

  // Validate URL
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol')
    }
  }
  catch {
    throw createError({
      statusCode: 400,
      message: 'Invalid URL format'
    })
  }

  try {
    // Fetch the page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RecipeScraper/1.0)',
        'Accept': 'text/html'
      }
    })

    if (!response.ok) {
      throw createError({
        statusCode: 400,
        message: `Failed to fetch URL: ${response.status} ${response.statusText}`
      })
    }

    const html = await response.text()

    // Try to extract structured data first
    const recipeSchema = extractRecipeSchema(html)

    if (recipeSchema) {
      const name = recipeSchema.name || ''
      const ingredients = recipeSchema.recipeIngredient || []
      const instructions = parseInstructions(recipeSchema.recipeInstructions)

      return {
        name,
        ingredients,
        instructions,
        source: 'schema'
      }
    }

    // Fallback: extract text and use AI
    const plainText = extractTextFromHtml(html)

    if (plainText.length < 100) {
      throw createError({
        statusCode: 400,
        message: 'Could not extract recipe content from this URL'
      })
    }

    const parsed = await parseRecipeWithAI(event, plainText)

    if (!parsed) {
      throw createError({
        statusCode: 500,
        message: 'Could not parse recipe from this page. Try a different URL.'
      })
    }

    return {
      name: '', // AI doesn't extract name, user will need to enter it
      ingredients: parsed.ingredients,
      instructions: parsed.instructions,
      source: 'ai'
    }
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    console.error('URL parsing failed:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to parse recipe from URL. Please try again.'
    })
  }
})
