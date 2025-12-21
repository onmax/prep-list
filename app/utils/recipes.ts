// Bump this when DEFAULT_CATEGORIES changes to reset stored data
export const RECIPES_VERSION = 2

export interface Recipe {
  id: string
  name: string
  ingredients: string[]
  instructions: string
}

export interface RecipeCategory {
  id: string
  name: string
  icon: string
  recipes: Recipe[]
}

export interface RecipesBook {
  version: number
  categories: RecipeCategory[]
  updatedAt: number
}

// Default categories + test recipe
export const DEFAULT_CATEGORIES: RecipeCategory[] = [
  {
    id: 'test-category',
    name: 'Test',
    icon: 'i-heroicons-beaker',
    recipes: [
      { id: 'test-1', name: 'Test', ingredients: ['Water', 'Hala Madrid'], instructions: 'Win 15 champions' },
      {
        id: 'test-2',
        name: "You're Bacon Me Crazy",
        ingredients: [
          'Strips of pure sizzle',
          'Eggs-traordinary eggs',
          'A-maize-ing cornbread',
          'Thyme flies butter'
        ],
        instructions: "Don't go bacon my heart\nWhisk it real good\nLet it sizzle until it's egg-cellent\nServe with a side of puns"
      }
    ]
  },
  {
    id: 'appetizers',
    name: 'Appetizers',
    icon: 'i-heroicons-sparkles',
    recipes: [
      {
        id: 'app-1',
        name: 'Lettuce Turnip the Beet',
        ingredients: [
          'Romaine calm lettuce',
          'Beets that drop',
          'Carrots who care-a-lot',
          'Radishing radishes',
          'Olive you vinaigrette'
        ],
        instructions: "Lettuce begin by washing the greens\nTurnip the beet and slice thin\nCarrot all? Shred them fine\nToss until you cant be-leaf how good it looks\nDrizzle and say olive you to your guests"
      }
    ]
  },
  { id: 'main-courses', name: 'Main Courses', icon: 'i-heroicons-fire', recipes: [] },
  { id: 'desserts', name: 'Desserts', icon: 'i-heroicons-cake', recipes: [] },
]
