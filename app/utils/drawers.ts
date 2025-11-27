export const DRAWERS = [
{ name: 'Foccacia', icon: 'i-heroicons-cube', items: ['Foccacia Bread', 'Whipped Butter', 'Lovange'] },
{ name: 'Olive', icon: 'i-heroicons-sparkles', items: [] },
{ name: 'Canned Fish', icon: 'i-heroicons-cake', items: ['Ali Oli', 'Cut Lemons', 'Vaccum Jalapeños'] },
{ name: 'Tuna Tartar', icon: 'i-heroicons-gift', items: ['Cut Tuna', 'Cut Tomatoes Cherry', 'Tuna Dressing'] },
{ name: 'Beef Tartar', icon: 'i-heroicons-fire', items: ['Cut Beef', 'Mushrooms for tartar', 'dashi mayo', 'Panki'] },
{ name: 'Grilled Leeks', icon: 'i-heroicons-star', items: ['Cut leeks', 'Grill Leeks', 'Vinnagrete', 'Boil Eggs', 'Cut Anchovies', 'Croutons', 'Cut Tarragon', 'Prepare Parsley'] },
{ name: 'Pasta Bolognese', icon: 'i-heroicons-sun', items: ['Bolognese Sauce', 'Brown Butter', 'Cut Vesterhavcst'] },
{ name: 'Padrons', icon: 'i-heroicons-square-3-stack-3d', items: ['Spear Padrons', 'Garlic Oil'] },
{ name: 'Patatas Bravas', icon: 'i-heroicons-beaker', items: ['Do potatoes', 'Bravas Sauce', 'Ali Oli', 'Put Bravas Sauce in small bags', 'Put Ali Oli in small bags'] },
{ name: 'Roasted Pumpkin', icon: 'i-heroicons-heart', items: ['Roast Pumkin', 'Cut Cheese for Pumpkin', 'Yoghurt', 'Pumpkin Pure', 'Cryspy Kale', 'Pomergranate'] },
{ name: 'Pasta al Tartufo', icon: 'i-heroicons-archive-box', items: ['Al Tartufo Sauce', 'Mushrooms for pasta', 'Truffle Butter', 'Cut Parmesan Cheese'] },
{ name: 'Cheese Plata', icon: 'i-heroicons-gift', items: ['Figs', 'Cut 3 Cheeses', 'Crakers'] },
{ name: 'Tiramisú', icon: 'i-heroicons-fire', items: ['Make Tiramisú'] }
  
export interface PrepItem { name: string, checked: boolean }
export interface PrepDrawer { name: string, icon?: string, items: PrepItem[] }
export interface PrepList { id?: string, createdAt: number, drawers: PrepDrawer[] }
