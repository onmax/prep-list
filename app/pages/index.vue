<script setup lang="ts">
import { jsPDF } from 'jspdf'
import type { PrepDrawer, PrepList } from '~/utils/drawers'
import { DRAWERS, DRAWERS_VERSION, AVAILABLE_ICONS } from '~/utils/drawers'
import type { Recipe, RecipeCategory, RecipesBook } from '~/utils/recipes'
import { DEFAULT_CATEGORIES, RECIPES_VERSION } from '~/utils/recipes'

const authExpiry = useLocalStorage<number | null>('prep-auth-expiry', null)
const authenticated = ref(false)
const pin = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)
const drawers = ref<PrepDrawer[]>([])

// Navigation state
type AppView = 'menu' | 'prep-list' | 'recipes'
const currentView = ref<AppView>('menu')

// Recipes state
const recipeCategories = ref<RecipeCategory[]>([])
const recipesEditMode = ref(false)
const savingRecipes = ref(false)
const showRecipeModal = ref(false)
const showRecipeCategoryModal = ref(false)
const editingCategoryIndex = ref<number | null>(null)
const editingRecipeIndex = ref<number | null>(null)
const editingCategory = ref({ name: '', icon: 'i-heroicons-beaker' })
const editingRecipe = ref<{ name: string, ingredients: string[], instructions: string }>({ name: '', ingredients: [''], instructions: '' })
const expandedRecipeId = ref<string | null>(null)

// Edit mode state
const editMode = ref(false)

const exitEditMode = async () => {
  editMode.value = false
  await saveList()
}
const showItemModal = ref(false)
const showDrawerModal = ref(false)
const editingDrawerIndex = ref<number | null>(null)
const editingItemIndex = ref<number | null>(null)
const editingValue = ref({ name: '', icon: 'i-heroicons-cube' })

const setDefaultDrawers = () => {
  drawers.value = DRAWERS.map(d => ({
    name: d.name,
    icon: d.icon,
    items: d.items.map(name => ({ name, checked: false }))
  }))
}

const checkAuth = async () => {
  if (authExpiry.value && authExpiry.value > Date.now()) {
    authenticated.value = true
    await Promise.all([fetchList(), fetchPreviousItems(), fetchOrderList(), fetchOrderHistory()])
    return
  }

  authExpiry.value = null
  authenticated.value = false
}

const onPinComplete = async (value: string[]) => {
  loading.value = true
  const pinCode = value.join('')
  const data = await $fetch('/api/auth/verify', { method: 'POST', body: { pin: pinCode } })
  if (data.success) {
    authenticated.value = true
    authExpiry.value = Date.now() + (24 * 60 * 60 * 1000)
    await Promise.all([fetchList(), fetchPreviousItems(), fetchOrderList(), fetchOrderHistory()])
  } else {
    pin.value = []
  }
  loading.value = false
}

const fetchList = async () => {
  try {
    const data = await $fetch('/api/list', { cache: 'no-store', query: { t: Date.now() } }) as PrepList | null
    console.log('Fetched from KV:', data)
    if (data?.drawers && data?.version === DRAWERS_VERSION) {
      drawers.value = data.drawers
      return
    }
    console.log('No data or version mismatch, using defaults')
  } catch (error) {
    console.error('Failed to fetch list, using defaults', error)
  }
  setDefaultDrawers()
}

const saveList = async () => {
  saving.value = true
  console.log('Saving to KV:', drawers.value)
  try {
    await $fetch('/api/list', { method: 'POST', body: { drawers: drawers.value, version: DRAWERS_VERSION }, cache: 'no-store' })
    console.log('Saved successfully')
  } catch (error) {
    console.error('Failed to save list', error)
  } finally {
    saving.value = false
  }
}

const toggleItem = (drawerName: string, itemName: string) => {
  const drawer = drawers.value.find(d => d.name === drawerName)
  if (!drawer) return
  const item = drawer.items.find(i => i.name === itemName)
  if (item) item.checked = !item.checked
}

const clearAll = () => {
  drawers.value.forEach(drawer => {
    drawer.items.forEach(item => {
      item.checked = false
    })
  })
}

// Custom item input
const customItemText = ref('')
const CUSTOM_ITEM_MAX_LENGTH = 50
const showSuggestions = ref(false)

// Previous items (history)
const previousItems = ref<string[]>([])
const showPreviousItemsModal = ref(false)

// Get all items from all drawers for search
const allDrawerItems = computed(() => {
  const items: { name: string, drawer: string }[] = []
  drawers.value.forEach(drawer => {
    drawer.items.forEach(item => {
      items.push({ name: item.name, drawer: drawer.name })
    })
  })
  return items
})

// Autocomplete suggestions based on previous items AND all drawer items
const filteredSuggestions = computed(() => {
  const query = customItemText.value.trim().toLowerCase()
  if (!query) return []

  // Search in all drawer items
  const drawerMatches = allDrawerItems.value
    .filter(item => item.name.toLowerCase().includes(query))
    .map(item => ({ name: item.name, source: item.drawer }))

  // Search in previous custom items (exclude if already in drawer matches)
  const drawerNames = new Set(drawerMatches.map(m => m.name.toLowerCase()))
  const previousMatches = previousItems.value
    .filter(item => item.toLowerCase().includes(query) && !drawerNames.has(item.toLowerCase()))
    .map(item => ({ name: item, source: 'History' }))

  // Combine and limit
  return [...drawerMatches, ...previousMatches].slice(0, 8)
})

// Check for exact match (case-insensitive) in all sources
const exactMatch = computed(() => {
  const query = customItemText.value.trim().toLowerCase()
  if (!query) return null

  // Check drawer items first
  const drawerMatch = allDrawerItems.value.find(item =>
    item.name.toLowerCase() === query
  )
  if (drawerMatch) return drawerMatch.name

  // Then check previous items
  return previousItems.value.find(item =>
    item.toLowerCase() === query
  ) || null
})

const fetchPreviousItems = async () => {
  try {
    const items = await $fetch<string[]>('/api/previous-items', { cache: 'no-store' })
    previousItems.value = items || []
  } catch (error) {
    console.error('Failed to fetch previous items', error)
  }
}

const saveToPreviousItems = async (item: string) => {
  try {
    await $fetch('/api/previous-items', { method: 'POST', body: { item } })
    // Refresh the list
    await fetchPreviousItems()
  } catch (error) {
    console.error('Failed to save to previous items', error)
  }
}

const addCustomItem = async (itemText?: string) => {
  // If Enter pressed and there's an exact match, use that
  const textToAdd = itemText || (exactMatch.value ? exactMatch.value : customItemText.value.trim())
  if (!textToAdd) return

  // Find or create "Other" section
  let otherDrawer = drawers.value.find(d => d.name === 'Other')
  if (!otherDrawer) {
    otherDrawer = { name: 'Other', icon: 'i-heroicons-pencil', items: [] }
    drawers.value.push(otherDrawer)
  }

  // Add item as checked
  otherDrawer.items.push({ name: textToAdd, checked: true })
  customItemText.value = ''
  showSuggestions.value = false

  // Save to previous items history (deduplication happens server-side)
  await saveToPreviousItems(textToAdd)
}

const selectSuggestion = (suggestion: { name: string, source: string }) => {
  // If the item exists in a drawer, toggle it instead of adding new
  const existingDrawer = drawers.value.find(d => d.name === suggestion.source)
  if (existingDrawer) {
    const existingItem = existingDrawer.items.find(i => i.name === suggestion.name)
    if (existingItem) {
      existingItem.checked = true
      customItemText.value = ''
      showSuggestions.value = false
      return
    }
  }
  // Otherwise add as custom item
  addCustomItem(suggestion.name)
}

const hideSuggestionsDelayed = () => {
  setTimeout(() => {
    showSuggestions.value = false
  }, 150)
}

// ============ ORDER LIST ============
const orderItems = ref<string[]>([])
const orderHistory = ref<string[]>([])
const orderItemText = ref('')
const showOrderSuggestions = ref(false)

const fetchOrderList = async () => {
  try {
    const items = await $fetch<string[]>('/api/order-list', { cache: 'no-store' })
    orderItems.value = items || []
  } catch (error) {
    console.error('Failed to fetch order list', error)
  }
}

const fetchOrderHistory = async () => {
  try {
    const items = await $fetch<string[]>('/api/order-history', { cache: 'no-store' })
    orderHistory.value = items || []
  } catch (error) {
    console.error('Failed to fetch order history', error)
  }
}

const saveOrderList = async () => {
  try {
    await $fetch('/api/order-list', { method: 'POST', body: { items: orderItems.value } })
  } catch (error) {
    console.error('Failed to save order list', error)
  }
}

const saveToOrderHistory = async (item: string) => {
  try {
    await $fetch('/api/order-history', { method: 'POST', body: { item } })
    await fetchOrderHistory()
  } catch (error) {
    console.error('Failed to save to order history', error)
  }
}

// Order list autocomplete - search history AND current items
const filteredOrderSuggestions = computed(() => {
  const query = orderItemText.value.trim().toLowerCase()
  if (!query) return []

  // Search in order history
  const historyMatches = orderHistory.value
    .filter(item => item.toLowerCase().includes(query))
    .map(item => ({ name: item, source: 'History' }))

  // Search in current order items (exclude if already in history matches)
  const historyNames = new Set(historyMatches.map(m => m.name.toLowerCase()))
  const currentMatches = orderItems.value
    .filter(item => item.toLowerCase().includes(query) && !historyNames.has(item.toLowerCase()))
    .map(item => ({ name: item, source: 'Current' }))

  // Combine and limit
  return [...historyMatches, ...currentMatches].slice(0, 8)
})

const addOrderItem = async (itemText?: string) => {
  const text = (itemText || orderItemText.value).trim()
  if (!text) return

  orderItems.value.push(text)
  orderItemText.value = ''
  showOrderSuggestions.value = false

  // Save to history and persist list
  await Promise.all([saveToOrderHistory(text), saveOrderList()])
}

const removeOrderItem = (index: number) => {
  orderItems.value.splice(index, 1)
  saveOrderList()
}

const clearOrderList = () => {
  orderItems.value = []
  saveOrderList()
}

const hideOrderSuggestionsDelayed = () => {
  setTimeout(() => {
    showOrderSuggestions.value = false
  }, 150)
}

// Filter mode: show only selected items
const showSelectedOnly = ref(false)

const filteredDrawers = computed(() => {
  if (!showSelectedOnly.value) return drawers.value
  return drawers.value.map(drawer => ({
    ...drawer,
    items: drawer.items.filter(item => item.checked)
  })).filter(drawer => drawer.items.length > 0)
})

const selectedCount = computed(() => {
  return drawers.value.reduce((acc, drawer) => acc + drawer.items.filter(item => item.checked).length, 0)
})

// PDF Export (A4 with checkboxes) - includes both Prep List and Order List
const exportPdf = () => {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  let y = margin

  // Date (next day, since prep is done the day before)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dateStr = tomorrow.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  // === PREP LIST ===
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('Prep List', pageWidth / 2, y, { align: 'center' })
  y += 12

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(dateStr, pageWidth / 2, y, { align: 'center' })
  y += 15

  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  doc.setFontSize(14)
  const prepItems = drawers.value.flatMap(d => d.items).filter(i => i.checked)
  prepItems.forEach((item, i) => {
    if (y > 280) { doc.addPage(); y = margin }
    doc.rect(margin, y - 4, 5, 5)
    doc.text(`${i + 1}. ${item.name}`, margin + 8, y)
    y += 8
  })

  // === ORDER LIST ===
  if (orderItems.value.length > 0) {
    y += 15
    if (y > 250) { doc.addPage(); y = margin }

    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.text('Order List', pageWidth / 2, y, { align: 'center' })
    y += 12

    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text(dateStr, pageWidth / 2, y, { align: 'center' })
    y += 15

    doc.line(margin, y, pageWidth - margin, y)
    y += 10

    doc.setFontSize(14)
    orderItems.value.forEach((item, i) => {
      if (y > 280) { doc.addPage(); y = margin }
      doc.rect(margin, y - 4, 5, 5)
      doc.text(`${i + 1}. ${item}`, margin + 8, y)
      y += 8
    })
  }

  doc.save(`lists-${new Date().toISOString().split('T')[0]}.pdf`)
}

// Receipt PDF for thermal printer (72mm width = 576 dots at 203dpi)
const generateReceiptPdf = (title: string, items: string[]): string => {
  // Calculate height based on items (approx 6mm per item + header)
  const itemHeight = 6
  const headerHeight = 30
  const height = headerHeight + (items.length * itemHeight) + 10

  // 72mm wide receipt (80mm paper - margins)
  const doc = new jsPDF({
    unit: 'mm',
    format: [72, Math.max(height, 50)]
  })

  const pageWidth = 72
  const margin = 4
  let y = 8

  // Title
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(title, pageWidth / 2, y, { align: 'center' })
  y += 6

  // Date
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(tomorrow.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  }), pageWidth / 2, y, { align: 'center' })
  y += 5

  // Separator line
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 5

  // Items
  doc.setFontSize(10)
  items.forEach((item, i) => {
    // Checkbox
    doc.rect(margin, y - 3, 3, 3)
    // Item text (truncate if too long)
    const text = item.length > 28 ? item.substring(0, 26) + '...' : item
    doc.text(`${i + 1}. ${text}`, margin + 5, y)
    y += itemHeight
  })

  // Return base64 without data URI prefix
  return doc.output('datauristring').split(',')[1]
}

// Print via Star PassPRNT (iOS) - generic function
const sendToPrinter = (pdfBase64: string) => {
  const callbackUrl = window.location.origin + window.location.pathname

  // Build PassPRNT URL with inline PDF
  const params = new URLSearchParams({
    pdf: pdfBase64,
    size: '576',  // 80mm = 576 dots
    back: callbackUrl
  })

  const deepLink = `starpassprnt://v1/print/nopreview?${params.toString()}`

  // Try to open PassPRNT
  const start = Date.now()
  window.location.href = deepLink

  // Fallback after 2s if app not installed
  setTimeout(() => {
    if (Date.now() - start < 3000) {
      if (confirm('Star PassPRNT app not found. Open App Store to install?')) {
        window.location.href = 'https://apps.apple.com/app/star-passprnt/id979827520'
      }
    }
  }, 2000)
}

// Print Prep List
const printPrepList = () => {
  const items = drawers.value.flatMap(d => d.items).filter(i => i.checked)
  if (items.length === 0) return
  const pdfBase64 = generateReceiptPdf('Prep List', items.map(i => i.name))
  sendToPrinter(pdfBase64)
}

// Print Order List
const printOrderList = () => {
  if (orderItems.value.length === 0) return
  const pdfBase64 = generateReceiptPdf('Order List', orderItems.value)
  sendToPrinter(pdfBase64)
}

// ============ NAVIGATION ============
const goToMenu = () => {
  currentView.value = 'menu'
}

const goToPrepList = async () => {
  currentView.value = 'prep-list'
  if (drawers.value.length === 0) {
    await fetchList()
  }
}

const goToRecipes = async () => {
  currentView.value = 'recipes'
  if (recipeCategories.value.length === 0) {
    await fetchRecipes()
  }
}

// ============ RECIPES ============
const setDefaultRecipeCategories = () => {
  recipeCategories.value = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES))
}

const fetchRecipes = async () => {
  try {
    const data = await $fetch('/api/recipes', { cache: 'no-store', query: { t: Date.now() } }) as RecipesBook | null
    console.log('Fetched recipes from KV:', data)
    if (data?.categories && data?.version === RECIPES_VERSION) {
      recipeCategories.value = data.categories
      return
    }
    console.log('No recipes or version mismatch, using defaults')
  } catch (error) {
    console.error('Failed to fetch recipes, using defaults', error)
  }
  setDefaultRecipeCategories()
}

const saveRecipes = async () => {
  savingRecipes.value = true
  console.log('Saving recipes to KV:', recipeCategories.value)
  try {
    await $fetch('/api/recipes', { method: 'POST', body: { categories: recipeCategories.value, version: RECIPES_VERSION }, cache: 'no-store' })
    console.log('Recipes saved successfully')
  } catch (error) {
    console.error('Failed to save recipes', error)
  } finally {
    savingRecipes.value = false
  }
}

// Auto-save helper for recipes
const autoSaveRecipes = () => {
  saveRecipes()
}

// Recipe Category CRUD
const openAddCategory = () => {
  editingCategoryIndex.value = null
  editingCategory.value = { name: '', icon: 'i-heroicons-beaker' }
  showRecipeCategoryModal.value = true
}

const openEditCategory = (index: number) => {
  const category = recipeCategories.value[index]
  editingCategoryIndex.value = index
  editingCategory.value = { name: category.name, icon: category.icon }
  showRecipeCategoryModal.value = true
}

const saveCategory = () => {
  if (!editingCategory.value.name.trim()) return
  if (editingCategoryIndex.value === null) {
    recipeCategories.value.push({
      id: `cat-${Date.now()}`,
      name: editingCategory.value.name.trim(),
      icon: editingCategory.value.icon,
      recipes: []
    })
  } else {
    recipeCategories.value[editingCategoryIndex.value].name = editingCategory.value.name.trim()
    recipeCategories.value[editingCategoryIndex.value].icon = editingCategory.value.icon
  }
  showRecipeCategoryModal.value = false
  autoSaveRecipes()
}

const deleteCategory = (index: number) => {
  recipeCategories.value.splice(index, 1)
  autoSaveRecipes()
}

// Recipe CRUD
const openAddRecipe = (categoryIndex: number) => {
  editingCategoryIndex.value = categoryIndex
  editingRecipeIndex.value = null
  editingRecipe.value = { name: '', ingredients: [''], instructions: '' }
  showRecipeModal.value = true
}

const openEditRecipe = (categoryIndex: number, recipeIndex: number) => {
  const recipe = recipeCategories.value[categoryIndex].recipes[recipeIndex]
  editingCategoryIndex.value = categoryIndex
  editingRecipeIndex.value = recipeIndex
  editingRecipe.value = {
    name: recipe.name,
    ingredients: [...recipe.ingredients],
    instructions: recipe.instructions
  }
  showRecipeModal.value = true
}

const saveRecipe = () => {
  if (editingCategoryIndex.value === null || !editingRecipe.value.name.trim()) return
  const filteredIngredients = editingRecipe.value.ingredients.filter(i => i.trim())
  if (editingRecipeIndex.value === null) {
    recipeCategories.value[editingCategoryIndex.value].recipes.push({
      id: `recipe-${Date.now()}`,
      name: editingRecipe.value.name.trim(),
      ingredients: filteredIngredients,
      instructions: editingRecipe.value.instructions.trim()
    })
  } else {
    const recipe = recipeCategories.value[editingCategoryIndex.value].recipes[editingRecipeIndex.value]
    recipe.name = editingRecipe.value.name.trim()
    recipe.ingredients = filteredIngredients
    recipe.instructions = editingRecipe.value.instructions.trim()
  }
  showRecipeModal.value = false
  autoSaveRecipes()
}

const deleteRecipe = (categoryIndex: number, recipeIndex: number) => {
  recipeCategories.value[categoryIndex].recipes.splice(recipeIndex, 1)
  autoSaveRecipes()
}

const addIngredient = () => {
  editingRecipe.value.ingredients.push('')
}

const removeIngredient = (index: number) => {
  editingRecipe.value.ingredients.splice(index, 1)
  if (editingRecipe.value.ingredients.length === 0) {
    editingRecipe.value.ingredients.push('')
  }
}

const toggleRecipeExpand = (recipeId: string) => {
  expandedRecipeId.value = expandedRecipeId.value === recipeId ? null : recipeId
}

// Recipe Printing
const generateRecipePdf = (recipe: Recipe): string => {
  // Calculate height based on content
  const ingredientHeight = recipe.ingredients.length * 5
  const instructionLines = Math.ceil(recipe.instructions.length / 35)
  const instructionHeight = instructionLines * 5
  const totalHeight = 45 + ingredientHeight + instructionHeight + 20

  const doc = new jsPDF({
    unit: 'mm',
    format: [72, Math.max(totalHeight, 80)]
  })

  const pageWidth = 72
  const margin = 4
  let y = 8

  // Recipe name
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(recipe.name, pageWidth / 2, y, { align: 'center' })
  y += 8

  // Separator
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 5

  // Ingredients header
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('INGREDIENTS', margin, y)
  y += 5

  // Ingredients list
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  recipe.ingredients.forEach(ingredient => {
    const text = ingredient.length > 32 ? ingredient.substring(0, 30) + '...' : ingredient
    doc.text(`- ${text}`, margin, y)
    y += 5
  })

  y += 3

  // Instructions header
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('INSTRUCTIONS', margin, y)
  y += 5

  // Instructions text
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const lines = doc.splitTextToSize(recipe.instructions, pageWidth - (margin * 2))
  doc.text(lines, margin, y)

  return doc.output('datauristring').split(',')[1]
}

const printRecipe = (recipe: Recipe) => {
  const pdfBase64 = generateRecipePdf(recipe)
  sendToPrinter(pdfBase64)
}

// Check if ingredient is in Order List
const isIngredientInOrder = (ingredient: string) => {
  return orderItems.value.includes(ingredient)
}

// Toggle ingredient in Order List (OL)
const toggleIngredientInOrder = async (ingredient: string) => {
  const index = orderItems.value.indexOf(ingredient)
  if (index >= 0) {
    // Remove from order list
    orderItems.value.splice(index, 1)
    await saveOrderList()
  } else {
    // Add to order list
    await addOrderItem(ingredient)
  }
}

// Check if step is in Prep List (Other drawer)
const isStepInPrep = (step: string) => {
  const otherDrawer = drawers.value.find(d => d.name === 'Other')
  if (!otherDrawer) return false
  return otherDrawer.items.some(item => item.name === step)
}

// Toggle step in Prep List / To Do (TD)
const toggleStepInPrep = async (step: string) => {
  let otherDrawer = drawers.value.find(d => d.name === 'Other')

  if (otherDrawer) {
    const itemIndex = otherDrawer.items.findIndex(item => item.name === step)
    if (itemIndex >= 0) {
      // Remove from prep list
      otherDrawer.items.splice(itemIndex, 1)
      return
    }
  }

  // Add to prep list
  await addCustomItem(step)
}

// Parse recipe instructions into individual steps
const getRecipeSteps = (instructions: string): string[] => {
  if (!instructions) return []
  // Split by newlines, filter empty lines
  const steps = instructions.split('\n').map(s => s.trim()).filter(s => s.length > 0)
  // If no newlines, return as single step
  return steps.length > 0 ? steps : [instructions]
}

// Check if all ingredients are selected
const areAllIngredientsSelected = (recipe: Recipe) => {
  if (recipe.ingredients.length === 0) return false
  return recipe.ingredients.every(ing => isIngredientInOrder(ing))
}

// Toggle all ingredients
const toggleAllIngredients = async (recipe: Recipe) => {
  if (areAllIngredientsSelected(recipe)) {
    // Remove all ingredients from order list
    for (const ing of recipe.ingredients) {
      const index = orderItems.value.indexOf(ing)
      if (index >= 0) {
        orderItems.value.splice(index, 1)
      }
    }
    await saveOrderList()
  } else {
    // Add all ingredients to order list
    for (const ing of recipe.ingredients) {
      if (!isIngredientInOrder(ing)) {
        await addOrderItem(ing)
      }
    }
  }
}

// Check if all steps are selected
const areAllStepsSelected = (recipe: Recipe) => {
  const steps = getRecipeSteps(recipe.instructions)
  if (steps.length === 0) return false
  return steps.every(step => isStepInPrep(step))
}

// Toggle all steps
const toggleAllSteps = async (recipe: Recipe) => {
  const steps = getRecipeSteps(recipe.instructions)
  if (areAllStepsSelected(recipe)) {
    // Remove all steps from prep list
    const otherDrawer = drawers.value.find(d => d.name === 'Other')
    if (otherDrawer) {
      for (const step of steps) {
        const itemIndex = otherDrawer.items.findIndex(item => item.name === step)
        if (itemIndex >= 0) {
          otherDrawer.items.splice(itemIndex, 1)
        }
      }
    }
  } else {
    // Add all steps to prep list
    for (const step of steps) {
      if (!isStepInPrep(step)) {
        await addCustomItem(step)
      }
    }
  }
}

// Check if whole recipe is selected (all ingredients + all steps)
const isWholeRecipeSelected = (recipe: Recipe) => {
  return areAllIngredientsSelected(recipe) && areAllStepsSelected(recipe)
}

// Toggle whole recipe
const toggleWholeRecipe = async (recipe: Recipe) => {
  if (isWholeRecipeSelected(recipe)) {
    // Deselect all
    await toggleAllIngredients(recipe)
    await toggleAllSteps(recipe)
  } else {
    // Select all that aren't selected
    if (!areAllIngredientsSelected(recipe)) {
      await toggleAllIngredients(recipe)
    }
    if (!areAllStepsSelected(recipe)) {
      await toggleAllSteps(recipe)
    }
  }
}

// Clear all recipe selections from OL and TD
const clearAllFromRecipes = async () => {
  // Clear Order List
  orderItems.value = []
  await saveOrderList()

  // Clear "Other" drawer items (where recipe steps are added)
  const otherDrawer = drawers.value.find(d => d.name === 'Other')
  if (otherDrawer) {
    otherDrawer.items = []
  }

  // Uncheck all items in all drawers
  for (const drawer of drawers.value) {
    for (const item of drawer.items) {
      item.checked = false
    }
  }
}

const exitRecipesEditMode = () => {
  recipesEditMode.value = false
}

// Drawer CRUD
const openAddDrawer = () => {
  editingDrawerIndex.value = null
  editingValue.value = { name: '', icon: 'i-heroicons-cube' }
  showDrawerModal.value = true
}

const openEditDrawer = (index: number) => {
  const drawer = drawers.value[index]
  editingDrawerIndex.value = index
  editingValue.value = { name: drawer.name, icon: drawer.icon || 'i-heroicons-cube' }
  showDrawerModal.value = true
}

const saveDrawer = () => {
  if (!editingValue.value.name.trim()) return
  if (editingDrawerIndex.value === null) {
    drawers.value.push({
      name: editingValue.value.name.trim(),
      icon: editingValue.value.icon,
      items: []
    })
  } else {
    drawers.value[editingDrawerIndex.value].name = editingValue.value.name.trim()
    drawers.value[editingDrawerIndex.value].icon = editingValue.value.icon
  }
  showDrawerModal.value = false
}

// Item CRUD
const openAddItem = (drawerIndex: number) => {
  editingDrawerIndex.value = drawerIndex
  editingItemIndex.value = null
  editingValue.value = { name: '', icon: '' }
  showItemModal.value = true
}

const openEditItem = (drawerIndex: number, itemIndex: number) => {
  editingDrawerIndex.value = drawerIndex
  editingItemIndex.value = itemIndex
  editingValue.value = { name: drawers.value[drawerIndex].items[itemIndex].name, icon: '' }
  showItemModal.value = true
}

const saveItem = () => {
  if (editingDrawerIndex.value === null || !editingValue.value.name.trim()) return
  if (editingItemIndex.value === null) {
    drawers.value[editingDrawerIndex.value].items.push({
      name: editingValue.value.name.trim(),
      checked: false
    })
  } else {
    drawers.value[editingDrawerIndex.value].items[editingItemIndex.value].name = editingValue.value.name.trim()
  }
  showItemModal.value = false
}

// Delete
const deleteDrawer = (drawerIndex: number) => {
  drawers.value.splice(drawerIndex, 1)
}

const deleteItem = (drawerIndex: number, itemIndex: number) => {
  drawers.value[drawerIndex].items.splice(itemIndex, 1)
}

onMounted(checkAuth)
</script>

<template>
  <UApp>
    <!-- PIN Entry -->
    <UMain v-if="!authenticated" class="flex items-center justify-center min-h-screen">
      <div class="flex flex-col items-center gap-3 p-4">
        <h2 class="text-lg font-semibold">Enter PIN</h2>
        <UPinInput v-model="pin" :length="4" type="number" mask otp placeholder="○" size="lg" :disabled="loading" @complete="onPinComplete" />
        <p v-if="loading" class="text-xs text-gray-500">Verifying...</p>
      </div>
    </UMain>

    <!-- Menu -->
    <UMain v-else-if="currentView === 'menu'" class="flex items-center justify-center min-h-screen">
      <div class="flex flex-col gap-4 w-full max-w-xs p-4">
        <h1 class="text-2xl font-bold text-center mb-4">Menu</h1>
        <UButton size="xl" block icon="i-heroicons-clipboard-document-list" @click="goToPrepList">
          Prep List
        </UButton>
        <UButton size="xl" block icon="i-heroicons-book-open" @click="goToRecipes">
          Recipes Book
        </UButton>
      </div>
    </UMain>

    <!-- Prep List View -->
    <UMain v-else-if="currentView === 'prep-list'" class="p-2">
      <div class="sticky top-0 bg-white dark:bg-gray-950 py-1 z-10 mb-2 space-y-2">
        <!-- Tab Navigation -->
        <div class="flex items-center gap-2">
          <UButton icon="i-heroicons-arrow-left" size="xs" variant="ghost" @click="goToMenu" />
          <div class="flex-1 flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all bg-white dark:bg-gray-700 text-green-600 dark:text-green-400 shadow-sm"
            >
              <UIcon name="i-heroicons-clipboard-document-list" class="w-4 h-4" />
              Prep
            </button>
            <button
              class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-gray-500 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400"
              @click="goToRecipes"
            >
              <UIcon name="i-heroicons-book-open" class="w-4 h-4" />
              Recipes
            </button>
          </div>
        </div>
        <!-- Action bar -->
        <div class="flex items-center gap-2">
          <template v-if="editMode">
            <UButton
              :loading="saving"
              icon="i-heroicons-check"
              size="xs"
              color="primary"
              @click="exitEditMode"
            >
              Done
            </UButton>
          </template>
          <template v-else>
            <UButton
              :icon="showSelectedOnly ? 'i-heroicons-eye' : 'i-heroicons-eye-slash'"
              size="xs"
              :color="showSelectedOnly ? 'primary' : 'neutral'"
              :variant="showSelectedOnly ? 'solid' : 'ghost'"
              @click="showSelectedOnly = !showSelectedOnly"
            >
              {{ selectedCount }}
            </UButton>
            <UButton
              v-if="!showSelectedOnly"
              icon="i-heroicons-x-circle"
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="selectedCount === 0"
              @click="clearAll"
            >
              Clear
            </UButton>
            <UButton
              v-if="showSelectedOnly"
              icon="i-heroicons-document-arrow-down"
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="selectedCount === 0"
              @click="exportPdf"
            >
              PDF
            </UButton>
            <UButton
              v-if="showSelectedOnly"
              icon="i-heroicons-receipt-percent"
              size="xs"
              color="primary"
              :disabled="selectedCount === 0"
              @click="printPrepList"
            >
              Print
            </UButton>
            <UButton
              v-if="!showSelectedOnly"
              icon="i-heroicons-pencil-square"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="editMode = true"
            >
              Edit
            </UButton>
            <UButton :loading="saving" icon="i-heroicons-arrow-down-tray" size="xs" color="primary" @click="saveList">Save</UButton>
          </template>
        </div>
      </div>

      <!-- TO DO SECTION (TD) -->
      <div class="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 border border-green-200 dark:border-green-800">
        <div class="flex items-center gap-2 mb-3 pb-2 border-b border-green-200 dark:border-green-700 -mx-3 -mt-3 px-3 pt-3 bg-green-500 dark:bg-green-700 rounded-t-lg">
          <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-white" />
          <h2 class="text-sm font-bold uppercase tracking-wide text-white">To Do</h2>
          <span v-if="selectedCount > 0" class="text-xs text-white/80">({{ selectedCount }} selected)</span>
        </div>

      <!-- Custom item input with autocomplete -->
      <div v-if="!editMode && !showSelectedOnly" class="mb-3 relative">
        <div class="flex gap-2">
          <div class="relative flex-1">
            <UInput
              v-model="customItemText"
              :maxlength="CUSTOM_ITEM_MAX_LENGTH"
              placeholder="Add custom item..."
              class="w-full"
              @focus="showSuggestions = true"
              @blur="hideSuggestionsDelayed"
              @keyup.enter="addCustomItem()"
            />
            <!-- Autocomplete dropdown -->
            <div
              v-if="showSuggestions && filteredSuggestions.length > 0"
              class="absolute z-20 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden"
            >
              <button
                v-for="suggestion in filteredSuggestions"
                :key="`${suggestion.source}-${suggestion.name}`"
                class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex justify-between items-center"
                :class="{ 'bg-green-50 dark:bg-green-900/20 font-medium': suggestion.name.toLowerCase() === customItemText.trim().toLowerCase() }"
                @mousedown.prevent="selectSuggestion(suggestion)"
              >
                <span>{{ suggestion.name }}</span>
                <span class="text-[10px] text-gray-400 uppercase">{{ suggestion.source }}</span>
              </button>
            </div>
          </div>
          <UButton
            icon="i-heroicons-plus"
            color="primary"
            :disabled="!customItemText.trim()"
            @click="addCustomItem()"
          >
            Add
          </UButton>
          <UButton
            icon="i-heroicons-clock"
            color="neutral"
            variant="outline"
            :disabled="previousItems.length === 0"
            @click="showPreviousItemsModal = true"
          >
            History
          </UButton>
        </div>
      </div>

      <!-- Divider line -->
      <div v-if="!editMode && !showSelectedOnly" class="border-b border-green-200 dark:border-green-700 my-2"></div>

      <div class="space-y-2">
        <template v-for="(drawer, drawerIndex) in (editMode ? drawers : filteredDrawers)" :key="drawer.name">
          <div v-if="editMode || drawer.items.length > 0">
            <div class="flex items-center justify-between mb-1">
              <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{{ drawer.name }}</div>
              <div v-if="editMode" class="flex gap-1">
                <UButton icon="i-heroicons-pencil" size="2xs" variant="ghost" @click="openEditDrawer(drawerIndex)" />
                <UButton icon="i-heroicons-trash" size="2xs" variant="ghost" color="error" @click="deleteDrawer(drawerIndex)" />
              </div>
            </div>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="(item, itemIndex) in drawer.items"
                :key="item.name"
                class="relative px-2 py-0.5 text-xs rounded-full border transition-all"
                :class="[
                  item.checked
                    ? 'bg-green-500 dark:bg-green-600 border-green-600 dark:border-green-500 text-white font-medium'
                    : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300',
                  editMode ? 'pr-5' : ''
                ]"
                @click="editMode ? openEditItem(drawerIndex, itemIndex) : toggleItem(drawer.name, item.name)"
              >
                {{ item.name }}
                <span
                  v-if="editMode"
                  class="absolute right-1 top-1/2 -translate-y-1/2 text-red-500 hover:text-red-700"
                  @click.stop="deleteItem(drawerIndex, itemIndex)"
                >
                  <UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
                </span>
              </button>
              <UButton
                v-if="editMode"
                icon="i-heroicons-plus"
                size="2xs"
                variant="outline"
                class="rounded-full"
                @click="openAddItem(drawerIndex)"
              />
            </div>
          </div>
        </template>
        <UButton
          v-if="editMode"
          icon="i-heroicons-plus"
          variant="outline"
          class="w-full"
          @click="openAddDrawer"
        >
          Add Section
        </UButton>
      </div>
      </div><!-- End To Do Section -->

      <!-- ORDER LIST SECTION (OL) -->
      <div v-if="!editMode" class="mt-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 overflow-hidden">
        <div class="flex items-center justify-between p-3 bg-amber-500 dark:bg-amber-700">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-truck" class="w-5 h-5 text-white" />
            <h2 class="text-sm font-bold uppercase tracking-wide text-white">Order List</h2>
            <span v-if="orderItems.length > 0" class="text-xs text-white/80">({{ orderItems.length }})</span>
          </div>
          <div class="flex items-center gap-1">
            <UButton
              v-if="orderItems.length > 0"
              icon="i-heroicons-receipt-percent"
              size="xs"
              color="primary"
              @click="printOrderList"
            >
              Print
            </UButton>
            <UButton
              v-if="orderItems.length > 0"
              icon="i-heroicons-x-circle"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="clearOrderList"
            >
              Clear
            </UButton>
          </div>
        </div>
        <div class="p-3">

        <!-- Order item input with autocomplete -->
        <div class="mb-3 relative">
          <div class="flex gap-2">
            <div class="relative flex-1">
              <UInput
                v-model="orderItemText"
                :maxlength="CUSTOM_ITEM_MAX_LENGTH"
                placeholder="Add order item..."
                class="w-full"
                @focus="showOrderSuggestions = true"
                @blur="hideOrderSuggestionsDelayed"
                @keyup.enter="addOrderItem()"
              />
              <!-- Autocomplete dropdown -->
              <div
                v-if="showOrderSuggestions && filteredOrderSuggestions.length > 0"
                class="absolute z-20 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden"
              >
                <button
                  v-for="suggestion in filteredOrderSuggestions"
                  :key="`${suggestion.source}-${suggestion.name}`"
                  class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex justify-between items-center"
                  :class="{ 'bg-amber-50 dark:bg-amber-900/20 font-medium': suggestion.name.toLowerCase() === orderItemText.trim().toLowerCase() }"
                  @mousedown.prevent="addOrderItem(suggestion.name)"
                >
                  <span>{{ suggestion.name }}</span>
                  <span class="text-[10px] text-gray-400 uppercase">{{ suggestion.source }}</span>
                </button>
              </div>
            </div>
            <UButton
              icon="i-heroicons-plus"
              color="primary"
              :disabled="!orderItemText.trim()"
              @click="addOrderItem()"
            >
              Add
            </UButton>
          </div>
        </div>

        <!-- Divider line -->
        <div class="border-b border-amber-200 dark:border-amber-700 my-2"></div>

        <!-- Order items list -->
        <div v-if="orderItems.length > 0" class="flex flex-wrap gap-1">
          <button
            v-for="(item, index) in orderItems"
            :key="`order-${index}-${item}`"
            class="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border bg-amber-500 dark:bg-amber-600 border-amber-600 dark:border-amber-500 text-white font-medium hover:bg-amber-600 dark:hover:bg-amber-700 transition-colors"
            @click="removeOrderItem(index)"
          >
            {{ item }}
            <UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
          </button>
        </div>
        <div v-else class="text-xs text-amber-400 dark:text-amber-500 italic">
          No order items yet
        </div>
        </div>
      </div>

    </UMain>

    <!-- Recipes Book View -->
    <UMain v-else-if="currentView === 'recipes'" class="p-2">
      <div class="sticky top-0 bg-white dark:bg-gray-950 py-1 z-10 mb-2 space-y-2">
        <!-- Tab Navigation -->
        <div class="flex items-center gap-2">
          <UButton icon="i-heroicons-arrow-left" size="xs" variant="ghost" @click="goToMenu" />
          <div class="flex-1 flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-gray-500 dark:text-gray-400 hover:text-green-500 dark:hover:text-green-400"
              @click="goToPrepList"
            >
              <UIcon name="i-heroicons-clipboard-document-list" class="w-4 h-4" />
              Prep
            </button>
            <button
              class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all bg-white dark:bg-gray-700 text-rose-600 dark:text-rose-400 shadow-sm"
            >
              <UIcon name="i-heroicons-book-open" class="w-4 h-4" />
              Recipes
            </button>
          </div>
          <!-- Edit button -->
          <template v-if="recipesEditMode">
            <UButton icon="i-heroicons-check" size="xs" color="primary" @click="exitRecipesEditMode">Done</UButton>
          </template>
          <template v-else>
            <UButton icon="i-heroicons-pencil-square" size="xs" color="neutral" variant="ghost" @click="recipesEditMode = true">Edit</UButton>
          </template>
        </div>

        <!-- Status bar -->
        <div class="flex items-center gap-2 text-xs">
          <div class="flex items-center gap-1 px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
            <UIcon name="i-heroicons-clipboard-document-list" class="w-3.5 h-3.5" />
            <span class="font-medium">TD: {{ selectedCount }}</span>
          </div>
          <div class="flex items-center gap-1 px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
            <UIcon name="i-heroicons-truck" class="w-3.5 h-3.5" />
            <span class="font-medium">OL: {{ orderItems.length }}</span>
          </div>
          <div class="flex-1"></div>
          <UButton
            icon="i-heroicons-x-circle"
            size="xs"
            color="error"
            variant="soft"
            :disabled="selectedCount === 0 && orderItems.length === 0"
            @click="clearAllFromRecipes"
          >
            Clear All
          </UButton>
        </div>
      </div>

      <!-- Recipe Categories -->
      <div class="space-y-3">
        <template v-for="(category, categoryIndex) in recipeCategories" :key="category.id">
          <div class="bg-rose-50 dark:bg-rose-950/30 rounded-lg border border-rose-200 dark:border-rose-800 overflow-hidden">
            <!-- Category Header -->
            <div class="flex items-center justify-between p-3 bg-rose-400 dark:bg-rose-700">
              <div class="flex items-center gap-2">
                <UIcon :name="category.icon" class="w-5 h-5 text-white" />
                <h2 class="text-sm font-bold uppercase tracking-wide text-white">{{ category.name }}</h2>
                <span v-if="category.recipes.length > 0" class="text-xs text-white/80">({{ category.recipes.length }})</span>
              </div>
              <div v-if="recipesEditMode" class="flex gap-1">
                <UButton icon="i-heroicons-pencil" size="2xs" variant="ghost" @click="openEditCategory(categoryIndex)" />
                <UButton icon="i-heroicons-trash" size="2xs" variant="ghost" color="error" @click="deleteCategory(categoryIndex)" />
              </div>
            </div>

            <!-- Recipes in Category -->
            <div class="p-3 space-y-2">
              <template v-for="(recipe, recipeIndex) in category.recipes" :key="recipe.id">
                <div class="bg-white dark:bg-gray-800 rounded-lg border border-rose-200 dark:border-rose-700 shadow-sm overflow-hidden">
                  <!-- Recipe Header - Name with Add All & Print -->
                  <div class="flex items-center justify-between p-3 bg-rose-100 dark:bg-rose-900/30 border-b border-rose-200 dark:border-rose-700">
                    <span class="font-semibold text-rose-800 dark:text-rose-200">{{ recipe.name }}</span>
                    <div class="flex items-center gap-1">
                      <button
                        class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all"
                        :class="isWholeRecipeSelected(recipe)
                          ? 'bg-rose-500 text-white'
                          : 'bg-white dark:bg-gray-700 text-rose-600 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-800 border border-rose-300 dark:border-rose-600'"
                        @click="toggleWholeRecipe(recipe)"
                      >
                        <UIcon :name="isWholeRecipeSelected(recipe) ? 'i-heroicons-check' : 'i-heroicons-plus'" class="w-3.5 h-3.5" />
                        {{ isWholeRecipeSelected(recipe) ? 'Added' : 'Add All' }}
                      </button>
                      <UButton
                        icon="i-heroicons-printer"
                        size="2xs"
                        variant="ghost"
                        color="primary"
                        @click="printRecipe(recipe)"
                      />
                      <template v-if="recipesEditMode">
                        <UButton icon="i-heroicons-pencil" size="2xs" variant="ghost" @click="openEditRecipe(categoryIndex, recipeIndex)" />
                        <UButton icon="i-heroicons-trash" size="2xs" variant="ghost" color="error" @click="deleteRecipe(categoryIndex, recipeIndex)" />
                      </template>
                    </div>
                  </div>

                  <!-- Recipe Content -->
                  <div class="p-3 space-y-3">
                    <!-- Ingredients Section - Always visible -->
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <h4 class="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
                          <UIcon name="i-heroicons-shopping-cart" class="w-4 h-4 text-amber-500" />
                          Ingredients
                        </h4>
                        <button
                          class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all"
                          :class="areAllIngredientsSelected(recipe)
                            ? 'bg-amber-500 text-white'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200'"
                          @click="toggleAllIngredients(recipe)"
                        >
                          <UIcon :name="areAllIngredientsSelected(recipe) ? 'i-heroicons-x-mark' : 'i-heroicons-arrow-up-tray'" class="w-3 h-3" />
                          {{ areAllIngredientsSelected(recipe) ? 'Clear OL' : 'All → OL' }}
                        </button>
                      </div>
                      <ul class="space-y-1">
                        <li
                          v-for="(ingredient, i) in recipe.ingredients"
                          :key="i"
                          class="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all"
                          :class="isIngredientInOrder(ingredient)
                            ? 'bg-amber-100 dark:bg-amber-900/40 border border-amber-400 dark:border-amber-600'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
                          @click="toggleIngredientInOrder(ingredient)"
                        >
                          <UIcon
                            :name="isIngredientInOrder(ingredient) ? 'i-heroicons-check-circle-solid' : 'i-heroicons-plus-circle'"
                            class="w-5 h-5 flex-shrink-0"
                            :class="isIngredientInOrder(ingredient) ? 'text-amber-500' : 'text-gray-400'"
                          />
                          <span
                            class="text-sm"
                            :class="isIngredientInOrder(ingredient) ? 'text-amber-700 dark:text-amber-300 font-medium' : ''"
                          >
                            {{ ingredient }}
                          </span>
                        </li>
                      </ul>
                    </div>

                    <!-- Steps Section - Collapsible -->
                    <div class="border-t border-gray-200 dark:border-gray-700 pt-3">
                      <div
                        class="flex items-center justify-between mb-2 cursor-pointer"
                        @click="toggleRecipeExpand(recipe.id)"
                      >
                        <h4 class="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
                          <UIcon
                            :name="expandedRecipeId === recipe.id ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                            class="w-4 h-4 text-gray-400"
                          />
                          <UIcon name="i-heroicons-clipboard-document-list" class="w-4 h-4 text-green-500" />
                          Steps
                          <span class="text-gray-400 font-normal">({{ getRecipeSteps(recipe.instructions).length }})</span>
                        </h4>
                        <button
                          class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all"
                          :class="areAllStepsSelected(recipe)
                            ? 'bg-green-500 text-white'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200'"
                          @click.stop="toggleAllSteps(recipe)"
                        >
                          <UIcon :name="areAllStepsSelected(recipe) ? 'i-heroicons-x-mark' : 'i-heroicons-arrow-up-tray'" class="w-3 h-3" />
                          {{ areAllStepsSelected(recipe) ? 'Clear TD' : 'All → TD' }}
                        </button>
                      </div>
                      <!-- Steps list - Expandable -->
                      <ul v-if="expandedRecipeId === recipe.id" class="space-y-1">
                        <li
                          v-for="(step, i) in getRecipeSteps(recipe.instructions)"
                          :key="i"
                          class="flex items-start gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all"
                          :class="isStepInPrep(step)
                            ? 'bg-green-100 dark:bg-green-900/40 border border-green-400 dark:border-green-600'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
                          @click="toggleStepInPrep(step)"
                        >
                          <UIcon
                            :name="isStepInPrep(step) ? 'i-heroicons-check-circle-solid' : 'i-heroicons-plus-circle'"
                            class="w-5 h-5 flex-shrink-0 mt-0.5"
                            :class="isStepInPrep(step) ? 'text-green-500' : 'text-gray-400'"
                          />
                          <span
                            class="text-sm"
                            :class="isStepInPrep(step) ? 'text-green-700 dark:text-green-300 font-medium' : ''"
                          >
                            {{ step }}
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Add Recipe Button -->
              <UButton
                v-if="recipesEditMode"
                icon="i-heroicons-plus"
                size="xs"
                variant="outline"
                class="w-full"
                @click="openAddRecipe(categoryIndex)"
              >
                Add Recipe
              </UButton>

              <!-- Empty state -->
              <div v-if="category.recipes.length === 0 && !recipesEditMode" class="text-xs text-rose-400 dark:text-rose-500 italic py-2">
                No recipes in this category
              </div>
            </div>
          </div>
        </template>

        <!-- Add Category Button -->
        <UButton
          v-if="recipesEditMode"
          icon="i-heroicons-plus"
          variant="outline"
          class="w-full"
          @click="openAddCategory"
        >
          Add Category
        </UButton>
      </div>
    </UMain>

    <!-- Item Modal -->
    <UModal v-model:open="showItemModal">
      <template #header>
        <h3 class="font-semibold">{{ editingItemIndex === null ? 'Add Item' : 'Edit Item' }}</h3>
      </template>
      <template #body>
        <UInput
          v-model="editingValue.name"
          placeholder="Item name"
          autofocus
          @keyup.enter="saveItem"
        />
      </template>
      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" @click="showItemModal = false">Cancel</UButton>
          <UButton color="primary" @click="saveItem">Save</UButton>
        </div>
      </template>
    </UModal>

    <!-- Drawer Modal -->
    <UModal v-model:open="showDrawerModal">
      <template #header>
        <h3 class="font-semibold">{{ editingDrawerIndex === null ? 'Add Section' : 'Edit Section' }}</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UInput
            v-model="editingValue.name"
            placeholder="Section name"
            autofocus
          />
          <div>
            <label class="text-xs text-gray-500 mb-2 block">Icon</label>
            <div class="grid grid-cols-8 gap-2">
              <button
                v-for="icon in AVAILABLE_ICONS"
                :key="icon"
                class="p-2 rounded border transition-colors"
                :class="editingValue.icon === icon ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'"
                @click="editingValue.icon = icon"
              >
                <UIcon :name="icon" class="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" @click="showDrawerModal = false">Cancel</UButton>
          <UButton color="primary" @click="saveDrawer">Save</UButton>
        </div>
      </template>
    </UModal>

    <!-- Previous Items Modal -->
    <UModal v-model:open="showPreviousItemsModal">
      <template #header>
        <h3 class="font-semibold">Previous Items</h3>
      </template>
      <template #body>
        <div v-if="previousItems.length === 0" class="text-gray-500 text-sm">
          No previous items yet.
        </div>
        <div v-else class="flex flex-wrap gap-2">
          <button
            v-for="item in previousItems"
            :key="item"
            class="flex items-center gap-1 px-2 py-1 text-sm rounded-full border bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            @click="addCustomItem(item)"
          >
            {{ item }}
            <UIcon name="i-heroicons-plus" class="w-3 h-3" />
          </button>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end">
          <UButton variant="ghost" @click="showPreviousItemsModal = false">Close</UButton>
        </div>
      </template>
    </UModal>

    <!-- Recipe Category Modal -->
    <UModal v-model:open="showRecipeCategoryModal">
      <template #header>
        <h3 class="font-semibold">{{ editingCategoryIndex === null ? 'Add Category' : 'Edit Category' }}</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UInput
            v-model="editingCategory.name"
            placeholder="Category name"
            autofocus
          />
          <div>
            <label class="text-xs text-gray-500 mb-2 block">Icon</label>
            <div class="grid grid-cols-8 gap-2">
              <button
                v-for="icon in AVAILABLE_ICONS"
                :key="icon"
                class="p-2 rounded border transition-colors"
                :class="editingCategory.icon === icon ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20' : 'border-gray-200 dark:border-gray-700'"
                @click="editingCategory.icon = icon"
              >
                <UIcon :name="icon" class="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" @click="showRecipeCategoryModal = false">Cancel</UButton>
          <UButton color="primary" @click="saveCategory">Save</UButton>
        </div>
      </template>
    </UModal>

    <!-- Recipe Modal -->
    <UModal v-model:open="showRecipeModal">
      <template #header>
        <h3 class="font-semibold">{{ editingRecipeIndex === null ? 'Add Recipe' : 'Edit Recipe' }}</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UInput
            v-model="editingRecipe.name"
            placeholder="Recipe name"
            autofocus
          />

          <!-- Ingredients -->
          <div>
            <label class="text-xs text-gray-500 mb-2 block">Ingredients</label>
            <div class="space-y-2">
              <div v-for="(ingredient, index) in editingRecipe.ingredients" :key="index" class="flex gap-2">
                <UInput
                  v-model="editingRecipe.ingredients[index]"
                  placeholder="Ingredient"
                  class="flex-1"
                />
                <UButton
                  icon="i-heroicons-x-mark"
                  size="xs"
                  variant="ghost"
                  color="error"
                  @click="removeIngredient(index)"
                />
              </div>
              <UButton
                icon="i-heroicons-plus"
                size="xs"
                variant="outline"
                @click="addIngredient"
              >
                Add Ingredient
              </UButton>
            </div>
          </div>

          <!-- Instructions -->
          <div>
            <label class="text-xs text-gray-500 mb-2 block">Instructions</label>
            <UTextarea
              v-model="editingRecipe.instructions"
              placeholder="Step by step instructions..."
              :rows="4"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" @click="showRecipeModal = false">Cancel</UButton>
          <UButton color="primary" @click="saveRecipe">Save</UButton>
        </div>
      </template>
    </UModal>
  </UApp>
</template>
