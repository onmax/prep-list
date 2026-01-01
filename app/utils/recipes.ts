// Bump this when DEFAULT_CATEGORIES changes to reset stored data
export const RECIPES_VERSION = 3

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

// Default categories with sample recipes
export const DEFAULT_CATEGORIES: RecipeCategory[] = [
  {
    id: 'appetizers',
    name: 'Appetizers',
    icon: 'i-heroicons-sparkles',
    recipes: [
      {
        id: 'app-1',
        name: 'Tomato Bruschetta',
        ingredients: [
          '400g cherry tomatoes',
          '50ml olive oil',
          '3 cloves garlic',
          '150g fresh mozzarella',
          '1 baguette'
        ],
        instructions: 'Dice tomatoes and mozzarella into small cubes\nMince garlic and mix with olive oil\nCombine tomatoes, mozzarella and garlic oil in a bowl\nSlice baguette and toast until golden\nTop bread slices with tomato mixture'
      },
      {
        id: 'app-2',
        name: 'Spinach Dip',
        ingredients: [
          '300g frozen spinach',
          '250ml sour cream',
          '200g cream cheese',
          '100g parmesan',
          '2 cloves garlic'
        ],
        instructions: 'Thaw spinach and squeeze out excess water\nMix sour cream and cream cheese until smooth\nGrate parmesan and mince garlic\nCombine spinach with cream mixture, parmesan and garlic\nBake at 180°C for 20 minutes'
      }
    ]
  },
  {
    id: 'main-courses',
    name: 'Main Courses',
    icon: 'i-heroicons-fire',
    recipes: [
      {
        id: 'main-1',
        name: 'Chicken Stir Fry',
        ingredients: [
          '500g chicken breast',
          '200g broccoli',
          '150g bell peppers',
          '100ml soy sauce',
          '30ml sesame oil',
          '300g rice'
        ],
        instructions: 'Cut chicken into strips and marinate in half the soy sauce\nChop broccoli and peppers into bite-sized pieces\nCook rice according to package instructions\nStir fry chicken in sesame oil until golden\nAdd vegetables and remaining soy sauce, cook 5 minutes\nServe stir fry over rice'
      },
      {
        id: 'main-2',
        name: 'Pasta Carbonara',
        ingredients: [
          '400g spaghetti',
          '200g pancetta',
          '4 eggs',
          '100g pecorino cheese',
          '2L water',
          '20g salt'
        ],
        instructions: 'Boil water with salt and cook spaghetti\nDice pancetta and fry until crispy\nBeat eggs and mix with grated pecorino\nDrain pasta, reserving 100ml pasta water\nToss hot pasta with pancetta and egg mixture\nAdd pasta water to reach creamy consistency'
      },
      {
        id: 'main-3',
        name: 'Beef Tacos',
        ingredients: [
          '450g ground beef',
          '8 taco shells',
          '200g cheddar cheese',
          '150ml salsa',
          '100g lettuce',
          '50ml lime juice'
        ],
        instructions: 'Brown ground beef in a pan\nShred lettuce and grate cheddar cheese\nWarm taco shells in oven for 3 minutes\nFill shells with beef, top with cheese and lettuce\nDrizzle with salsa and lime juice'
      }
    ]
  },
  {
    id: 'desserts',
    name: 'Desserts',
    icon: 'i-heroicons-cake',
    recipes: [
      {
        id: 'des-1',
        name: 'Chocolate Mousse',
        ingredients: [
          '200g dark chocolate',
          '300ml heavy cream',
          '3 eggs',
          '50g sugar',
          '20ml vanilla extract'
        ],
        instructions: 'Melt chocolate in a double boiler\nSeparate eggs, beat whites with sugar until stiff\nWhip cream with vanilla until soft peaks form\nFold melted chocolate into egg yolks\nGently fold in whipped cream, then egg whites\nChill for 4 hours before serving'
      },
      {
        id: 'des-2',
        name: 'Fruit Smoothie Bowl',
        ingredients: [
          '2 frozen bananas',
          '150g frozen berries',
          '200ml almond milk',
          '50g granola',
          '30g honey'
        ],
        instructions: 'Blend frozen bananas and berries with almond milk\nPour thick smoothie into a bowl\nTop with granola and drizzle with honey\nServe immediately'
      }
    ]
  },
  {
    id: 'sauces',
    name: 'Sauces',
    icon: 'i-heroicons-beaker',
    recipes: [
      {
        id: 'sauce-1',
        name: 'Basic Tomato Sauce',
        ingredients: [
          '800g canned tomatoes',
          '100ml olive oil',
          '4 cloves garlic',
          '10g basil',
          '5g salt',
          '3g sugar'
        ],
        instructions: 'Mince garlic and sauté in olive oil\nAdd canned tomatoes and crush with spoon\nSeason with salt and sugar\nSimmer for 30 minutes stirring occasionally\nAdd fresh basil at the end'
      }
    ]
  }
]
