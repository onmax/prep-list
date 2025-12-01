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

const toggleItem = (drawerIdx: number, itemIdx: number) => {
  drawers.value[drawerIdx].items[itemIdx].checked = !drawers.value[drawerIdx].items[itemIdx].checked
}

const accordionItems = computed(() =>
  drawers.value.map((drawer, idx) => {
    const uncheckedCount = drawer.items.filter(item => !item.checked).length
    return {
      label: drawer.name,
      icon: drawer.icon,
      slot: `drawer-${idx}`,
      defaultOpen: idx === 0,
      badge: uncheckedCount > 0 ? uncheckedCount : undefined
    }
  })
)

onMounted(checkAuth)
</script>

<template>
  <UApp>
    <UMain v-if="!authenticated" class="flex items-center justify-center min-h-screen">
      <UContainer>
        <UCard class="w-full max-w-sm mx-auto">
          <template #header>
            <h2 class="text-xl font-bold text-center">Enter PIN</h2>
          </template>
          <div class="flex flex-col items-center gap-4 p-4">
            <UPinInput v-model="pin" :length="4" type="number" mask otp placeholder="○" size="xl" :disabled="loading" @complete="onPinComplete" />
            <p v-if="loading" class="text-sm text-gray-500">Verifying...</p>
          </div>
        </UCard>
      </UContainer>
    </UMain>

    <UMain v-else>
      <UContainer class="py-4 space-y-4">
        <div class="flex justify-between items-center sticky top-0 bg-white dark:bg-gray-950 py-3 z-10">
          <h1 class="text-2xl font-bold">Prep List</h1>
          <UButton :loading="saving" icon="i-heroicons-check" size="lg" color="primary" @click="saveList">Save</UButton>
        </div>

        <UAccordion :items="accordionItems" :default-open="0" multiple>
          <template v-for="(drawer, dIdx) in drawers" :key="dIdx" #[`item-${dIdx}`]="{ item, open }">
            <UButton color="gray" variant="ghost" class="w-full justify-between">
              <div class="flex items-center gap-2">
                <UIcon :name="item.icon" class="size-5" />
                <span class="font-medium">{{ item.label }}</span>
                <UBadge v-if="item.badge" :label="String(item.badge)" color="primary" variant="subtle" size="xs" />
              </div>
              <UIcon :name="open ? 'i-heroicons-chevron-up-20-solid' : 'i-heroicons-chevron-down-20-solid'" class="size-5 transition-transform" />
            </UButton>
          </template>
          <template v-for="(drawer, dIdx) in drawers" :key="dIdx" #[`drawer-${dIdx}`]>
            <div class="p-4">
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <UCheckbox v-for="(item, iIdx) in drawer.items" :key="iIdx" :model-value="item.checked" variant="card" size="sm" @update:model-value="toggleItem(dIdx, iIdx)">
                  <template #label>
                    <span :class="{ 'line-through text-gray-500': item.checked }">{{ item.name }}</span>
                  </template>
                </UCheckbox>
              </div>
            </div>
          </template>
        </UAccordion>
      </UContainer>
    </UMain>
  </UApp>
</template>
