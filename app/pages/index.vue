<script setup lang="ts">
import { jsPDF } from 'jspdf'
import type { PrepDrawer, PrepList } from '~/utils/drawers'
import { DRAWERS, DRAWERS_VERSION, AVAILABLE_ICONS } from '~/utils/drawers'

const authExpiry = useLocalStorage<number | null>('prep-auth-expiry', null)
const authenticated = ref(false)
const pin = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)
const drawers = ref<PrepDrawer[]>([])

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
    await fetchList()
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
    await fetchList()
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

const addCustomItem = () => {
  const text = customItemText.value.trim()
  if (!text) return

  // Find or create "Other" section
  let otherDrawer = drawers.value.find(d => d.name === 'Other')
  if (!otherDrawer) {
    otherDrawer = { name: 'Other', icon: 'i-heroicons-pencil', items: [] }
    drawers.value.push(otherDrawer)
  }

  // Add item as checked
  otherDrawer.items.push({ name: text, checked: true })
  customItemText.value = ''
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

// PDF Export (A4 with checkboxes)
const exportPdf = () => {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  let y = margin

  // Title
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('Prep List', pageWidth / 2, y, { align: 'center' })
  y += 12

  // Date (next day, since prep is done the day before)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(tomorrow.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }), pageWidth / 2, y, { align: 'center' })
  y += 15

  // Line
  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  // Items (flat list, numbered with checkbox)
  doc.setFontSize(14)
  const items = drawers.value.flatMap(d => d.items).filter(i => i.checked)
  items.forEach((item, i) => {
    if (y > 280) { doc.addPage(); y = margin }
    // Draw checkbox
    doc.rect(margin, y - 4, 5, 5)
    doc.text(`${i + 1}. ${item.name}`, margin + 8, y)
    y += 8
  })

  doc.save(`prep-list-${new Date().toISOString().split('T')[0]}.pdf`)
}

// Receipt PDF for thermal printer (72mm width = 576 dots at 203dpi)
const generateReceiptPdf = (): string => {
  const items = drawers.value.flatMap(d => d.items).filter(i => i.checked)

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
  doc.text('Prep List', pageWidth / 2, y, { align: 'center' })
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
    const text = item.name.length > 28 ? item.name.substring(0, 26) + '...' : item.name
    doc.text(`${i + 1}. ${text}`, margin + 5, y)
    y += itemHeight
  })

  // Return base64 without data URI prefix
  return doc.output('datauristring').split(',')[1]
}

// Print via Star PassPRNT (iOS)
const printReceipt = () => {
  const items = drawers.value.flatMap(d => d.items).filter(i => i.checked)
  if (items.length === 0) return

  const pdfBase64 = generateReceiptPdf()
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
    <UMain v-if="!authenticated" class="flex items-center justify-center min-h-screen">
      <div class="flex flex-col items-center gap-3 p-4">
        <h2 class="text-lg font-semibold">Enter PIN</h2>
        <UPinInput v-model="pin" :length="4" type="number" mask otp placeholder="○" size="lg" :disabled="loading" @complete="onPinComplete" />
        <p v-if="loading" class="text-xs text-gray-500">Verifying...</p>
      </div>
    </UMain>

    <UMain v-else class="p-2">
      <div class="flex justify-between items-center sticky top-0 bg-white dark:bg-gray-950 py-1 z-10 mb-2">
        <h1 class="text-lg font-bold">Prep</h1>
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
              @click="printReceipt"
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

      <!-- Custom item input -->
      <div v-if="!editMode" class="mt-4 flex gap-2">
        <UInput
          v-model="customItemText"
          :maxlength="CUSTOM_ITEM_MAX_LENGTH"
          placeholder="Add custom item..."
          class="flex-1"
          @keyup.enter="addCustomItem"
        />
        <UButton
          icon="i-heroicons-plus"
          color="primary"
          :disabled="!customItemText.trim()"
          @click="addCustomItem"
        >
          Add
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
  </UApp>
</template>
