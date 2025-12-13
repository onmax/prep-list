<script setup lang="ts">
import type { PrepDrawer, PrepList } from '~/utils/drawers'
import { DRAWERS, DRAWERS_VERSION } from '~/utils/drawers'

const authExpiry = useLocalStorage<number | null>('prep-auth-expiry', null)
const authenticated = ref(false)
const pin = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)
const drawers = ref<PrepDrawer[]>([])

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
    await fetchList()
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
          <UButton
            :icon="showSelectedOnly ? 'i-heroicons-eye' : 'i-heroicons-eye-slash'"
            size="xs"
            :color="showSelectedOnly ? 'primary' : 'neutral'"
            :variant="showSelectedOnly ? 'solid' : 'ghost'"
            @click="showSelectedOnly = !showSelectedOnly"
          >
            {{ selectedCount }}
          </UButton>
          <UButton :loading="saving" icon="i-heroicons-check" size="xs" color="primary" @click="saveList">Save</UButton>
        </div>
      </div>

      <div class="space-y-2">
        <template v-for="drawer in filteredDrawers" :key="drawer.name">
          <div v-if="drawer.items.length > 0">
            <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{{ drawer.name }}</div>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="item in drawer.items"
                :key="item.name"
                class="px-2 py-0.5 text-xs rounded-full border transition-all"
                :class="item.checked
                  ? 'bg-green-500 dark:bg-green-600 border-green-600 dark:border-green-500 text-white font-medium'
                  : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'"
                @click="toggleItem(drawer.name, item.name)"
              >
                {{ item.name }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </UMain>
  </UApp>
</template>
