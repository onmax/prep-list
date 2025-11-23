export const DRAWERS = [
  { name: 'Freezer', icon: 'i-heroicons-cube', items: ['Tuna', 'Beef'] },
  { name: 'Tuna Tartar', icon: 'i-heroicons-sparkles', items: ['Cut Tuna', 'Cut Tomatoes', 'Tomatoes', 'Dressing', 'Mustard', 'Pre-Dressing'] },
  { name: 'Cheese', icon: 'i-heroicons-cake', items: ['Blue Cheese', 'Goat Cheese', 'Other cheese', 'Figs', 'Burratas'] },
  { name: 'Tiramisu', icon: 'i-heroicons-gift', items: ['Tiramisu Slided'] },
  { name: 'Grilled Leak', icon: 'i-heroicons-fire', items: ['Grilled Leak', 'Leak', 'Leak Dressing', 'Vinaigrette', 'Boil eggs', 'Eggs', 'Parsley'] },
  { name: 'Beef Tartar', icon: 'i-heroicons-star', items: ['Cut Beef', 'Danish Mayo', 'Pickled Mushrooms'] },
  { name: 'Pumpkin', icon: 'i-heroicons-sun', items: ['Roasted Pumpkin', 'Pomegranate', 'Goat Cheese', 'Yogurt Dressing', 'Jalapeño Pepper', 'Capers in box'] },
  { name: 'Potatoes', icon: 'i-heroicons-square-3-stack-3d', items: ['Potatoes', 'Ali Oli', 'Bravas', 'Capers', 'Truffle Paste'] },
  { name: 'Truffle Pasta', icon: 'i-heroicons-bolt', items: ['Truffle Sauce', 'Mushrooms for pasta', 'Parmesan Cheese', 'Truffle Butter', 'Black Truffle'] },
  { name: 'Padrons', icon: 'i-heroicons-beaker', items: ['Padrons Peppers', 'Garlic Oil'] },
  { name: 'Bolognese', icon: 'i-heroicons-heart', items: ['Bolognese', 'Brown Butter', 'Vesterhavcst'] },
  { name: 'Cold Section', icon: 'i-heroicons-archive-box', items: ['Panko', 'Mushrooms powder', 'Paprika', 'Wheat', 'Nuts', 'Salt', 'Olive Oil'] }
]

export interface PrepItem { name: string, checked: boolean }
export interface PrepDrawer { name: string, icon?: string, items: PrepItem[] }
export interface PrepList { id?: string, createdAt: number, drawers: PrepDrawer[] }
