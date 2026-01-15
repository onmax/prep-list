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
const editingSteps = ref<string[]>([''])
const expandedRecipeId = ref<string | null>(null)

// Recipe Creation state
const showCreateRecipeModal = ref(false)
const createRecipeName = ref('')
const createRecipeCategoryId = ref<string | null>(null)
const createIngredients = ref<string[]>([''])
const createSteps = ref<string[]>([''])
const createError = ref('')

// Recipe Import state
const importLoading = ref(false)
const importUrl = ref('')

// Reorder recipes within a category
const moveRecipeUp = (categoryIndex: number, recipeIndex: number) => {
  if (recipeIndex > 0) {
    const recipes = recipeCategories.value[categoryIndex].recipes
    const temp = recipes[recipeIndex]
    recipes[recipeIndex] = recipes[recipeIndex - 1]
    recipes[recipeIndex - 1] = temp
    autoSaveRecipes()
  }
}

const moveRecipeDown = (categoryIndex: number, recipeIndex: number) => {
  const recipes = recipeCategories.value[categoryIndex].recipes
  if (recipeIndex < recipes.length - 1) {
    const temp = recipes[recipeIndex]
    recipes[recipeIndex] = recipes[recipeIndex + 1]
    recipes[recipeIndex + 1] = temp
    autoSaveRecipes()
  }
}

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

// Copy Prep List to clipboard
const copyPrepListToClipboard = async () => {
  const items = drawers.value.flatMap(d => d.items).filter(i => i.checked)
  if (items.length === 0) return
  const text = items.map(i => `- ${i.name}`).join('\n')
  await navigator.clipboard.writeText(text)
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
  editingSteps.value = ['']
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
  // Parse instructions into individual steps for editing
  const steps = recipe.instructions.split('\n').filter(s => s.trim())
  editingSteps.value = steps.length > 0 ? steps : ['']
  showRecipeModal.value = true
}

const saveRecipe = () => {
  if (editingCategoryIndex.value === null || !editingRecipe.value.name.trim()) return
  const filteredIngredients = editingRecipe.value.ingredients.filter(i => i.trim())
  const filteredSteps = editingSteps.value.filter(s => s.trim())
  const instructions = filteredSteps.join('\n')
  if (editingRecipeIndex.value === null) {
    recipeCategories.value[editingCategoryIndex.value].recipes.push({
      id: `recipe-${Date.now()}`,
      name: editingRecipe.value.name.trim(),
      ingredients: filteredIngredients,
      instructions
    })
  } else {
    const recipe = recipeCategories.value[editingCategoryIndex.value].recipes[editingRecipeIndex.value]
    recipe.name = editingRecipe.value.name.trim()
    recipe.ingredients = filteredIngredients
    recipe.instructions = instructions
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

const addEditStep = () => {
  editingSteps.value.push('')
}

const removeEditStep = (index: number) => {
  if (editingSteps.value.length > 1) {
    editingSteps.value.splice(index, 1)
  } else {
    editingSteps.value[0] = ''
  }
}

const handleEditStepKeydown = (event: KeyboardEvent, index: number) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (editingSteps.value[index].trim()) {
      editingSteps.value.splice(index + 1, 0, '')
      nextTick(() => {
        const inputs = document.querySelectorAll('[data-edit-step-input]')
        const nextInput = inputs[index + 1] as HTMLInputElement
        nextInput?.focus()
      })
    }
  }
}

const handleEditIngredientKeydown = (event: KeyboardEvent, index: number) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (editingRecipe.value.ingredients[index].trim()) {
      editingRecipe.value.ingredients.splice(index + 1, 0, '')
      nextTick(() => {
        const inputs = document.querySelectorAll('[data-edit-ingredient-input]')
        const nextInput = inputs[index + 1] as HTMLInputElement
        nextInput?.focus()
      })
    }
  }
}

const toggleRecipeExpand = (recipeId: string) => {
  expandedRecipeId.value = expandedRecipeId.value === recipeId ? null : recipeId
}

// Recipe Comments
const updatePrepComment = (categoryIndex: number, recipeIndex: number, comment: string) => {
  const recipe = recipeCategories.value[categoryIndex].recipes[recipeIndex]
  recipe.prepComment = comment || undefined
  autoSaveRecipes()
}

// Step Comment Modal state
const showStepCommentModal = ref(false)
const editingStepComment = ref({
  categoryIndex: 0,
  recipeIndex: 0,
  stepIndex: 0,
  stepText: '',
  comment: ''
})

const openStepCommentModal = (categoryIndex: number, recipeIndex: number, stepIndex: number, stepText: string) => {
  const recipe = recipeCategories.value[categoryIndex].recipes[recipeIndex]
  editingStepComment.value = {
    categoryIndex,
    recipeIndex,
    stepIndex,
    stepText,
    comment: recipe.stepComments?.[stepIndex] || ''
  }
  showStepCommentModal.value = true
}

const saveStepComment = () => {
  const { categoryIndex, recipeIndex, stepIndex, comment } = editingStepComment.value
  const recipe = recipeCategories.value[categoryIndex].recipes[recipeIndex]

  if (!recipe.stepComments) {
    recipe.stepComments = {}
  }

  if (comment.trim()) {
    recipe.stepComments[stepIndex] = comment.trim()
  } else {
    delete recipe.stepComments[stepIndex]
    // Clean up empty object
    if (Object.keys(recipe.stepComments).length === 0) {
      recipe.stepComments = undefined
    }
  }

  showStepCommentModal.value = false
  autoSaveRecipes()
}

// Recipe Creation
const openCreateRecipeModal = () => {
  createRecipeName.value = ''
  createRecipeCategoryId.value = recipeCategories.value[0]?.id || null
  createIngredients.value = ['']
  createSteps.value = ['']
  createError.value = ''
  importUrl.value = ''
  importLoading.value = false
  showCreateRecipeModal.value = true
}

// Populate form from parsed recipe data
const populateRecipeForm = (data: { name?: string, ingredients: string[], instructions: string }) => {
  if (data.name) {
    createRecipeName.value = data.name
  }
  if (data.ingredients.length > 0) {
    createIngredients.value = [...data.ingredients, '']
  }
  if (data.instructions) {
    const steps = data.instructions.split('\n').filter(s => s.trim())
    if (steps.length > 0) {
      createSteps.value = [...steps, '']
    }
  }
}


// Handle URL import
const importFromUrl = async () => {
  if (!importUrl.value.trim()) {
    createError.value = 'Please enter a URL'
    return
  }

  importLoading.value = true
  createError.value = ''

  try {
    const result = await $fetch('/api/parse-recipe-url', {
      method: 'POST',
      body: { url: importUrl.value.trim() }
    }) as { name: string, ingredients: string[], instructions: string }

    populateRecipeForm(result)
    importUrl.value = '' // Clear URL after successful import
  } catch (error: unknown) {
    console.error('URL import failed:', error)
    const fetchError = error as { data?: { message?: string } }
    createError.value = fetchError?.data?.message || (error instanceof Error ? error.message : 'Failed to import from URL. Please try again.')
  } finally {
    importLoading.value = false
  }
}

const handleIngredientKeydown = (event: KeyboardEvent, index: number) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    // Only add new line if current field has content
    if (createIngredients.value[index].trim()) {
      createIngredients.value.splice(index + 1, 0, '')
      nextTick(() => {
        const inputs = document.querySelectorAll('[data-ingredient-input]')
        const nextInput = inputs[index + 1] as HTMLInputElement
        nextInput?.focus()
      })
    }
  }
}

const handleStepKeydown = (event: KeyboardEvent, index: number) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    // Only add new line if current field has content
    if (createSteps.value[index].trim()) {
      createSteps.value.splice(index + 1, 0, '')
      nextTick(() => {
        const inputs = document.querySelectorAll('[data-step-input]')
        const nextInput = inputs[index + 1] as HTMLInputElement
        nextInput?.focus()
      })
    }
  }
}

const removeCreateIngredient = (index: number) => {
  if (createIngredients.value.length > 1) {
    createIngredients.value.splice(index, 1)
  } else {
    createIngredients.value[0] = ''
  }
}

const removeCreateStep = (index: number) => {
  if (createSteps.value.length > 1) {
    createSteps.value.splice(index, 1)
  } else {
    createSteps.value[0] = ''
  }
}

const saveCreatedRecipe = () => {
  createError.value = ''

  if (!createRecipeName.value.trim()) {
    createError.value = 'Please enter a recipe name.'
    return
  }
  if (!createRecipeCategoryId.value) {
    createError.value = 'Please select a category.'
    return
  }

  const filteredIngredients = createIngredients.value.filter(i => i.trim())
  const filteredSteps = createSteps.value.filter(s => s.trim())

  if (filteredIngredients.length === 0) {
    createError.value = 'Please add at least one ingredient.'
    return
  }

  const categoryIndex = recipeCategories.value.findIndex(c => c.id === createRecipeCategoryId.value)
  if (categoryIndex === -1) return

  recipeCategories.value[categoryIndex].recipes.push({
    id: `recipe-${Date.now()}`,
    name: createRecipeName.value.trim(),
    ingredients: filteredIngredients,
    instructions: filteredSteps.join('\n')
  })

  showCreateRecipeModal.value = false
  autoSaveRecipes()
}

// Recipe Printing
const generateRecipePdf = (recipe: Recipe): string => {
  // Calculate height based on content
  const ingredientHeight = recipe.ingredients.length * 5
  const steps = getRecipeSteps(recipe.instructions)
  const prepCommentHeight = recipe.prepComment ? 15 : 0
  // Calculate step comments height
  let stepCommentsHeight = 0
  if (recipe.stepComments) {
    Object.keys(recipe.stepComments).forEach(() => {
      stepCommentsHeight += 8 // Extra height per step comment
    })
  }
  const instructionLines = Math.ceil(recipe.instructions.length / 35)
  const instructionHeight = instructionLines * 5
  const totalHeight = 45 + prepCommentHeight + ingredientHeight + instructionHeight + stepCommentsHeight + 20

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

  // Prep Comment (if exists) - shown at top before ingredients
  if (recipe.prepComment) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    const commentLines = doc.splitTextToSize(`* ${recipe.prepComment}`, pageWidth - (margin * 2))
    doc.text(commentLines, margin, y)
    y += commentLines.length * 4 + 3
  }

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

  // Instructions with step comments
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  steps.forEach((step, index) => {
    const hasComment = recipe.stepComments?.[index]
    // Add small dot indicator if step has comment
    const prefix = hasComment ? '• ' : `${index + 1}. `
    const stepText = step.length > 60 ? step.substring(0, 58) + '...' : step
    const stepLines = doc.splitTextToSize(`${prefix}${stepText}`, pageWidth - (margin * 2))
    doc.text(stepLines, margin, y)
    y += stepLines.length * 4

    // Add step comment in smaller italic font
    if (hasComment) {
      doc.setFontSize(7)
      doc.setFont('helvetica', 'italic')
      const commentText = recipe.stepComments![index]
      const truncatedComment = commentText.length > 50 ? commentText.substring(0, 48) + '...' : commentText
      doc.text(`  → ${truncatedComment}`, margin + 2, y)
      y += 4
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
    }
    y += 1
  })

  return doc.output('datauristring').split(',')[1]
}

const printRecipe = (recipe: Recipe) => {
  const pdfBase64 = generateRecipePdf(recipe)
  sendToPrinter(pdfBase64)
}

// Cache for parsed ingredient names (full ingredient -> parsed item name)
const parsedIngredientCache = ref<Map<string, string>>(new Map())

// Parse ingredient to get plain item name (uses cache)
const getItemName = async (ingredient: string): Promise<string> => {
  // Check cache first
  if (parsedIngredientCache.value.has(ingredient)) {
    return parsedIngredientCache.value.get(ingredient)!
  }

  try {
    const { item } = await $fetch('/api/parse-ingredient', {
      method: 'POST',
      body: { ingredient }
    })
    // Cache the result
    parsedIngredientCache.value.set(ingredient, item)
    return item
  }
  catch {
    // Fallback to original on error
    return ingredient.trim()
  }
}

// Check if ingredient's parsed item is in Order List
const isIngredientInOrder = (ingredient: string) => {
  // Check if parsed version is in cache and in order list
  const parsed = parsedIngredientCache.value.get(ingredient)
  if (parsed) {
    return orderItems.value.includes(parsed)
  }
  // Fallback: check if original is in list (for items added before parsing)
  return orderItems.value.includes(ingredient)
}

// Toggle ingredient in Order List (OL) - parses to plain item name
const toggleIngredientInOrder = async (ingredient: string) => {
  const itemName = await getItemName(ingredient)
  const index = orderItems.value.indexOf(itemName)
  if (index >= 0) {
    // Remove from order list
    orderItems.value.splice(index, 1)
    await saveOrderList()
  } else {
    // Add parsed item to order list
    await addOrderItem(itemName)
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

// Check if all ingredients are selected (uses cache)
const areAllIngredientsSelected = (recipe: Recipe) => {
  if (recipe.ingredients.length === 0) return false
  return recipe.ingredients.every(ing => isIngredientInOrder(ing))
}

// Toggle all ingredients - parses all to plain item names
const toggleAllIngredients = async (recipe: Recipe) => {
  // Parse all ingredients in parallel
  const parsedItems = await Promise.all(
    recipe.ingredients.map(ing => getItemName(ing))
  )

  const allSelected = parsedItems.every(item => orderItems.value.includes(item))

  if (allSelected) {
    // Remove all parsed items from order list
    for (const item of parsedItems) {
      const index = orderItems.value.indexOf(item)
      if (index >= 0) {
        orderItems.value.splice(index, 1)
      }
    }
    await saveOrderList()
  } else {
    // Add all parsed items that aren't already in order list
    for (const item of parsedItems) {
      if (!orderItems.value.includes(item)) {
        await addOrderItem(item)
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

const exitRecipesEditMode = async () => {
  recipesEditMode.value = false
  await saveRecipes()
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
const newItemInputs = ref<string[]>([''])

const openAddItem = (drawerIndex: number) => {
  editingDrawerIndex.value = drawerIndex
  editingItemIndex.value = null
  editingValue.value = { name: '', icon: '' }
  newItemInputs.value = ['']
  showItemModal.value = true
}

const openEditItem = (drawerIndex: number, itemIndex: number) => {
  editingDrawerIndex.value = drawerIndex
  editingItemIndex.value = itemIndex
  editingValue.value = { name: drawers.value[drawerIndex].items[itemIndex].name, icon: '' }
  showItemModal.value = true
}

const handleNewItemKeydown = (event: KeyboardEvent, index: number) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (newItemInputs.value[index].trim()) {
      newItemInputs.value.splice(index + 1, 0, '')
      nextTick(() => {
        const inputs = document.querySelectorAll('[data-new-item-input]')
        const nextInput = inputs[index + 1] as HTMLInputElement
        nextInput?.focus()
      })
    }
  }
}

const removeNewItemInput = (index: number) => {
  if (newItemInputs.value.length > 1) {
    newItemInputs.value.splice(index, 1)
  } else {
    newItemInputs.value[0] = ''
  }
}

const saveItem = () => {
  if (editingDrawerIndex.value === null) return

  if (editingItemIndex.value === null) {
    // Adding new items - save all non-empty inputs
    const itemsToAdd = newItemInputs.value.filter(item => item.trim())
    if (itemsToAdd.length === 0) return

    for (const itemName of itemsToAdd) {
      drawers.value[editingDrawerIndex.value].items.push({
        name: itemName.trim(),
        checked: false
      })
    }
  } else {
    // Editing existing item
    if (!editingValue.value.name.trim()) return
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

// Reorder sections
const moveDrawerUp = (index: number) => {
  if (index > 0) {
    const temp = drawers.value[index]
    drawers.value[index] = drawers.value[index - 1]
    drawers.value[index - 1] = temp
  }
}

const moveDrawerDown = (index: number) => {
  if (index < drawers.value.length - 1) {
    const temp = drawers.value[index]
    drawers.value[index] = drawers.value[index + 1]
    drawers.value[index + 1] = temp
  }
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
              class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-gray-500 dark:text-gray-400 hover:text-teal-500 dark:hover:text-teal-400"
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
              color="primary"
              variant="ghost"
              :disabled="selectedCount === 0"
              @click="clearAll"
            >
              Clear
            </UButton>
            <UButton
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
              icon="i-heroicons-receipt-percent"
              size="xs"
              color="primary"
              :disabled="selectedCount === 0"
              @click="printPrepList"
            >
              Print
            </UButton>
            <UButton
              icon="i-heroicons-clipboard-document"
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="selectedCount === 0"
              @click="copyPrepListToClipboard"
            >
              Copy
            </UButton>
            <UButton
              v-if="!showSelectedOnly"
              icon="i-heroicons-pencil-square"
              size="xs"
              color="primary"
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
              <div class="flex items-center gap-1">
                <div v-if="editMode" class="flex flex-col">
                  <UButton
                    icon="i-heroicons-chevron-up"
                    size="2xs"
                    variant="ghost"
                    color="neutral"
                    :disabled="drawerIndex === 0"
                    class="!p-0 h-3"
                    @click="moveDrawerUp(drawerIndex)"
                  />
                  <UButton
                    icon="i-heroicons-chevron-down"
                    size="2xs"
                    variant="ghost"
                    color="neutral"
                    :disabled="drawerIndex === drawers.length - 1"
                    class="!p-0 h-3"
                    @click="moveDrawerDown(drawerIndex)"
                  />
                </div>
                <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{{ drawer.name }}</div>
              </div>
              <div v-if="editMode" class="flex gap-1">
                <UButton icon="i-heroicons-pencil" size="2xs" variant="ghost" color="primary" @click="openEditDrawer(drawerIndex)" />
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
              color="primary"
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
              class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all bg-white dark:bg-gray-700 text-teal-600 dark:text-teal-400 shadow-sm"
            >
              <UIcon name="i-heroicons-book-open" class="w-4 h-4" />
              Recipes
            </button>
          </div>
          <!-- Edit button -->
          <template v-if="recipesEditMode">
            <UButton :loading="savingRecipes" icon="i-heroicons-check" size="xs" color="primary" @click="exitRecipesEditMode">Done</UButton>
          </template>
          <template v-else>
            <UButton icon="i-heroicons-pencil-square" size="xs" color="primary" variant="ghost" @click="recipesEditMode = true">Edit</UButton>
          </template>
        </div>

        <!-- Edit Mode Banner -->
        <div v-if="recipesEditMode" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600">
          <UIcon name="i-heroicons-pencil-square" class="w-5 h-5 text-gray-600 dark:text-gray-300" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-200">Edit Mode</span>
          <span class="text-xs text-gray-500 dark:text-gray-400">- Manage your recipes and categories</span>
        </div>

        <!-- Status bar (hidden in edit mode) -->
        <div v-if="!recipesEditMode" class="flex items-center gap-2 text-xs">
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
            color="primary"
            variant="ghost"
            :disabled="selectedCount === 0 && orderItems.length === 0"
            @click="clearAllFromRecipes"
          >
            Clear All
          </UButton>
        </div>

        <!-- Create New Recipe Button (hidden in edit mode) -->
        <UButton
          v-if="!recipesEditMode"
          icon="i-heroicons-plus-circle"
          size="sm"
          color="primary"
          class="w-full"
          @click="openCreateRecipeModal"
        >
          Create New Recipe
        </UButton>
      </div>

      <!-- EDIT MODE: Simple list layout -->
      <div v-if="recipesEditMode" class="space-y-4">
        <template v-for="(category, categoryIndex) in recipeCategories" :key="category.id">
          <div class="bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            <!-- Category Header - Edit Mode -->
            <div class="flex items-center justify-between p-3 bg-gray-200 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600">
              <div class="flex items-center gap-2">
                <UIcon :name="category.icon" class="w-5 h-5 text-gray-700 dark:text-gray-300" />
                <h2 class="text-sm font-bold uppercase tracking-wide text-gray-800 dark:text-gray-200">{{ category.name }}</h2>
                <span v-if="category.recipes.length > 0" class="text-xs text-gray-500 dark:text-gray-400">({{ category.recipes.length }})</span>
              </div>
              <div class="flex items-center gap-1">
                <UButton
                  icon="i-heroicons-pencil"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  @click="openEditCategory(categoryIndex)"
                />
                <UButton
                  icon="i-heroicons-trash"
                  size="xs"
                  variant="ghost"
                  color="error"
                  @click="deleteCategory(categoryIndex)"
                />
              </div>
            </div>

            <!-- Recipe List - Edit Mode -->
            <div class="divide-y divide-gray-200 dark:divide-gray-600">
              <div
                v-for="(recipe, recipeIndex) in category.recipes"
                :key="recipe.id"
                class="flex items-center gap-2 px-4 py-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <!-- Delete Button (far left) -->
                <UButton
                  icon="i-heroicons-trash"
                  size="xs"
                  variant="ghost"
                  color="error"
                  @click.stop="deleteRecipe(categoryIndex, recipeIndex)"
                />

                <!-- Up/Down Buttons -->
                <div class="flex flex-col">
                  <UButton
                    icon="i-heroicons-chevron-up"
                    size="2xs"
                    variant="ghost"
                    color="neutral"
                    :disabled="recipeIndex === 0"
                    class="!p-0 h-3"
                    @click="moveRecipeUp(categoryIndex, recipeIndex)"
                  />
                  <UButton
                    icon="i-heroicons-chevron-down"
                    size="2xs"
                    variant="ghost"
                    color="neutral"
                    :disabled="recipeIndex === category.recipes.length - 1"
                    class="!p-0 h-3"
                    @click="moveRecipeDown(categoryIndex, recipeIndex)"
                  />
                </div>

                <!-- Recipe Name (clickable to edit) -->
                <button
                  class="flex-1 text-left font-medium text-gray-900 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                  @click="openEditRecipe(categoryIndex, recipeIndex)"
                >
                  {{ recipe.name }}
                </button>
              </div>
            </div>

            <!-- Empty state -->
            <div v-if="category.recipes.length === 0" class="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 italic bg-white dark:bg-gray-900">
              No recipes in this category
            </div>

            <!-- Add Recipe Button -->
            <div class="px-4 py-2 bg-white dark:bg-gray-900">
              <UButton
                icon="i-heroicons-plus"
                size="xs"
                variant="outline"
                color="neutral"
                class="w-full"
                @click="openAddRecipe(categoryIndex)"
              >
                Add Recipe
              </UButton>
            </div>
          </div>
        </template>

        <!-- Add Category Button -->
        <UButton
          icon="i-heroicons-plus"
          variant="outline"
          color="neutral"
          class="w-full"
          @click="openAddCategory"
        >
          Add Category
        </UButton>
      </div>

      <!-- NORMAL MODE: Full recipe cards -->
      <div v-else class="space-y-3">
        <template v-for="(category, categoryIndex) in recipeCategories" :key="category.id">
          <div class="bg-teal-50 dark:bg-teal-950/30 rounded-lg border border-teal-200 dark:border-teal-800 overflow-hidden">
            <!-- Category Header -->
            <div class="flex items-center justify-between p-3 bg-teal-500 dark:bg-teal-700">
              <div class="flex items-center gap-2">
                <UIcon :name="category.icon" class="w-5 h-5 text-white" />
                <h2 class="text-sm font-bold uppercase tracking-wide text-white">{{ category.name }}</h2>
                <span v-if="category.recipes.length > 0" class="text-xs text-white/80">({{ category.recipes.length }})</span>
              </div>
            </div>

            <!-- Recipes in Category -->
            <div class="p-3 space-y-2">
              <template v-for="(recipe, recipeIndex) in category.recipes" :key="recipe.id">
                <div class="bg-white dark:bg-gray-800 rounded-lg border border-teal-200 dark:border-teal-700 shadow-sm overflow-hidden">
                  <!-- Recipe Header - Name with Add All & Print -->
                  <div class="flex items-center justify-between p-3 bg-teal-100 dark:bg-teal-900/30 border-b border-teal-200 dark:border-teal-700">
                    <span class="font-semibold text-teal-800 dark:text-teal-200">{{ recipe.name }}</span>
                    <div class="flex items-center gap-1">
                      <button
                        class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all"
                        :class="isWholeRecipeSelected(recipe)
                          ? 'bg-emerald-500 text-white'
                          : 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 border border-emerald-300 dark:border-emerald-600'"
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
                            ? 'bg-emerald-500 text-white'
                            : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200'"
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

                    <!-- Prep Comment Section -->
                    <div class="border-t border-gray-200 dark:border-gray-700 pt-3">
                      <div class="flex items-center gap-2 mb-2">
                        <UIcon name="i-heroicons-chat-bubble-bottom-center-text" class="w-4 h-4 text-purple-500" />
                        <h4 class="text-xs font-semibold text-gray-500 uppercase">Prep Notes</h4>
                        <span v-if="recipe.prepComment" class="w-2 h-2 rounded-full bg-purple-500"></span>
                      </div>
                      <UTextarea
                        :model-value="recipe.prepComment || ''"
                        placeholder="Any comment for prep..."
                        :rows="2"
                        class="text-sm"
                        @update:model-value="updatePrepComment(categoryIndex, recipeIndex, $event)"
                      />
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
                            ? 'bg-emerald-500 text-white'
                            : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200'"
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
                          class="group"
                        >
                          <div
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
                              class="flex-1 text-sm"
                              :class="isStepInPrep(step) ? 'text-green-700 dark:text-green-300 font-medium' : ''"
                            >
                              {{ step }}
                            </span>
                            <!-- Step comment indicator -->
                            <span v-if="recipe.stepComments?.[i]" class="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0 mt-1.5"></span>
                            <!-- Comment button -->
                            <button
                              class="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              :class="recipe.stepComments?.[i] ? 'text-purple-500' : 'text-gray-400 hover:text-purple-500'"
                              @click.stop="openStepCommentModal(categoryIndex, recipeIndex, i, step)"
                            >
                              <UIcon name="i-heroicons-chat-bubble-left" class="w-4 h-4" />
                            </button>
                          </div>
                          <!-- Step comment display -->
                          <div
                            v-if="recipe.stepComments?.[i]"
                            class="ml-9 mr-2 mt-1 mb-2 px-2 py-1.5 bg-purple-50 dark:bg-purple-900/20 rounded text-xs text-purple-700 dark:text-purple-300 border-l-2 border-purple-400"
                          >
                            {{ recipe.stepComments[i] }}
                          </div>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Empty state -->
              <div v-if="category.recipes.length === 0" class="text-xs text-teal-400 dark:text-teal-500 italic py-2">
                No recipes in this category
              </div>
            </div>
          </div>
        </template>
      </div>
    </UMain>

    <!-- Item Modal -->
    <UModal v-model:open="showItemModal">
      <template #header>
        <h3 class="font-semibold">{{ editingItemIndex === null ? 'Add Items' : 'Edit Item' }}</h3>
      </template>
      <template #body>
        <!-- Edit mode: single input -->
        <UInput
          v-if="editingItemIndex !== null"
          v-model="editingValue.name"
          placeholder="Item name"
          autofocus
          @keyup.enter="saveItem"
        />
        <!-- Add mode: multiple inputs -->
        <div v-else class="space-y-2">
          <label class="text-xs text-gray-500 block">Press Enter to add more items</label>
          <div v-for="(item, index) in newItemInputs" :key="index" class="flex gap-2">
            <UInput
              v-model="newItemInputs[index]"
              placeholder="Type item and press Enter"
              class="flex-1"
              :autofocus="index === 0"
              data-new-item-input
              @keydown="handleNewItemKeydown($event, index)"
            />
            <UButton
              icon="i-heroicons-x-mark"
              size="xs"
              variant="ghost"
              color="error"
              @click="removeNewItemInput(index)"
            />
          </div>
        </div>
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

    <!-- Step Comment Modal -->
    <UModal v-model:open="showStepCommentModal">
      <template #header>
        <h3 class="font-semibold">Step Comment</h3>
      </template>
      <template #body>
        <div class="space-y-3">
          <div class="p-2 bg-gray-100 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300">
            {{ editingStepComment.stepText }}
          </div>
          <UTextarea
            v-model="editingStepComment.comment"
            placeholder="Add a comment for this step..."
            :rows="3"
            autofocus
          />
        </div>
      </template>
      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" @click="showStepCommentModal = false">Cancel</UButton>
          <UButton color="primary" @click="saveStepComment">Save</UButton>
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
                :class="editingCategory.icon === icon ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-gray-200 dark:border-gray-700'"
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
            <label class="text-xs text-gray-500 mb-2 block">Ingredients (press Enter to add new)</label>
            <div class="space-y-2">
              <div v-for="(ingredient, index) in editingRecipe.ingredients" :key="index" class="flex gap-2">
                <UInput
                  v-model="editingRecipe.ingredients[index]"
                  placeholder="Type ingredient and press Enter"
                  class="flex-1"
                  data-edit-ingredient-input
                  @keydown="handleEditIngredientKeydown($event, index)"
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

          <!-- Steps -->
          <div>
            <label class="text-xs text-gray-500 mb-2 block">Steps (press Enter to add new)</label>
            <div class="space-y-2">
              <div v-for="(step, index) in editingSteps" :key="index" class="flex gap-2">
                <div class="flex items-center gap-2 flex-1">
                  <span class="text-xs text-gray-400 w-5">{{ index + 1 }}.</span>
                  <UInput
                    v-model="editingSteps[index]"
                    placeholder="Type step and press Enter"
                    class="flex-1"
                    data-edit-step-input
                    @keydown="handleEditStepKeydown($event, index)"
                  />
                </div>
                <UButton
                  icon="i-heroicons-x-mark"
                  size="xs"
                  variant="ghost"
                  color="error"
                  @click="removeEditStep(index)"
                />
              </div>
            </div>
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

    <!-- Create Recipe Modal -->
    <UModal v-model:open="showCreateRecipeModal">
      <template #header>
        <h3 class="font-semibold">Create New Recipe</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <!-- URL Import Section -->
          <div class="space-y-3 pb-3 border-b border-gray-200 dark:border-gray-700">
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Import from URL</label>
              <div class="flex gap-2">
                <UInput
                  v-model="importUrl"
                  placeholder="https://example.com/recipe"
                  class="flex-1"
                  :disabled="importLoading"
                />
                <UButton
                  size="sm"
                  :disabled="importLoading || !importUrl.trim()"
                  :loading="importLoading"
                  @click="importFromUrl"
                >
                  Import
                </UButton>
              </div>
            </div>
          </div>

          <!-- Divider -->
          <div class="flex items-center gap-2 text-xs text-gray-400">
            <div class="flex-1 border-t border-gray-200 dark:border-gray-700" />
            <span>or enter manually</span>
            <div class="flex-1 border-t border-gray-200 dark:border-gray-700" />
          </div>

          <!-- Recipe Name -->
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Recipe Name</label>
            <UInput
              v-model="createRecipeName"
              placeholder="Enter recipe name"
            />
          </div>

          <!-- Category Selection Grid -->
          <div>
            <label class="text-xs text-gray-500 mb-2 block">Category</label>
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="cat in recipeCategories"
                :key="cat.id"
                class="p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-all"
                :class="createRecipeCategoryId === cat.id
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/50'
                  : 'border-gray-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-600'"
                @click="createRecipeCategoryId = cat.id"
              >
                <UIcon :name="cat.icon" class="w-5 h-5" :class="createRecipeCategoryId === cat.id ? 'text-teal-600' : 'text-gray-500'" />
                <span class="text-[10px] text-center leading-tight" :class="createRecipeCategoryId === cat.id ? 'text-teal-700 dark:text-teal-300 font-medium' : 'text-gray-600 dark:text-gray-400'">{{ cat.name }}</span>
              </button>
            </div>
          </div>

          <!-- Ingredients -->
          <div>
            <label class="text-xs text-gray-500 mb-2 block">Ingredients (press Enter to add new)</label>
            <div class="space-y-2">
              <div v-for="(ingredient, index) in createIngredients" :key="index" class="flex gap-2">
                <UInput
                  v-model="createIngredients[index]"
                  placeholder="Type ingredient and press Enter"
                  class="flex-1"
                  data-ingredient-input
                  @keydown="handleIngredientKeydown($event, index)"
                />
                <UButton
                  icon="i-heroicons-x-mark"
                  size="xs"
                  variant="ghost"
                  color="error"
                  @click="removeCreateIngredient(index)"
                />
              </div>
            </div>
          </div>

          <!-- Steps -->
          <div>
            <label class="text-xs text-gray-500 mb-2 block">Steps (press Enter to add new)</label>
            <div class="space-y-2">
              <div v-for="(step, index) in createSteps" :key="index" class="flex gap-2">
                <div class="flex items-center gap-2 flex-1">
                  <span class="text-xs text-gray-400 w-5">{{ index + 1 }}.</span>
                  <UInput
                    v-model="createSteps[index]"
                    placeholder="Type step and press Enter"
                    class="flex-1"
                    data-step-input
                    @keydown="handleStepKeydown($event, index)"
                  />
                </div>
                <UButton
                  icon="i-heroicons-x-mark"
                  size="xs"
                  variant="ghost"
                  color="error"
                  @click="removeCreateStep(index)"
                />
              </div>
            </div>
          </div>

          <!-- Error Message -->
          <div v-if="createError" class="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm">
            {{ createError }}
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" @click="showCreateRecipeModal = false">Cancel</UButton>
          <UButton color="primary" @click="saveCreatedRecipe">
            Save Recipe
          </UButton>
        </div>
      </template>
    </UModal>
  </UApp>
</template>
