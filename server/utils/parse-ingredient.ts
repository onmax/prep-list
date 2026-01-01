// Regex patterns for common ingredient formats
// Matches quantity + unit at the start (e.g., "200g", "2 cups", "1/2 tsp")
const QUANTITY_PATTERN = /^[\d\s\/.,]+\s*(g|kg|ml|l|oz|lb|lbs|cup|cups|tsp|tbsp|teaspoon|teaspoons|tablespoon|tablespoons|bunch|bunches|pinch|pinches|can|cans|piece|pieces|slice|slices|large|medium|small|clove|cloves|head|heads|stalk|stalks|sprig|sprigs|handful|handfuls)s?\b\s*/i

// Matches preparation instructions at the end (e.g., ", chopped", ", finely diced")
const PREP_SUFFIX = /,?\s*(chopped|diced|sliced|minced|crushed|grated|peeled|trimmed|roughly|finely|thinly|freshly|to taste|optional|room temperature|at room temperature|softened|melted|beaten|whisked|sifted|divided|plus more|for serving|for garnish|as needed).*$/i

// Matches parenthetical notes (e.g., "(about 2 cups)", "(optional)")
const PARENTHETICAL = /\s*\([^)]*\)\s*/g

/**
 * Attempts to parse an ingredient string locally using regex patterns.
 * Returns the plain item name if successful, or null if AI parsing is needed.
 */
export function parseIngredientLocal(ingredient: string): string | null {
  if (!ingredient || typeof ingredient !== 'string') {
    return null
  }

  let result = ingredient.trim()

  // Remove parenthetical notes first
  result = result.replace(PARENTHETICAL, ' ')

  // Remove quantity/unit prefix
  result = result.replace(QUANTITY_PATTERN, '')

  // Remove preparation suffix
  result = result.replace(PREP_SUFFIX, '')

  // Clean up extra whitespace
  result = result.replace(/\s+/g, ' ').trim()

  // If we successfully shortened the string and it looks reasonable
  if (result && result.length > 0 && result.length < ingredient.length * 0.9) {
    return result
  }

  // If the original was already short and simple, return it as-is
  if (ingredient.length <= 20 && !QUANTITY_PATTERN.test(ingredient)) {
    return ingredient.trim()
  }

  return null // Needs AI parsing
}
