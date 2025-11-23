<script setup lang="ts">
import type { PrepDrawer } from '~/utils/drawers'
import { DRAWERS } from '~/utils/drawers'

const authExpiry = useLocalStorage<number | null>('prep-auth-expiry', null)
const authenticated = ref(false)
const pin = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)
const drawers = ref<PrepDrawer[]>([])

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
  const data = await $fetch('/api/list')
  console.log('Fetched from KV:', data)
  if (data) {
    drawers.value = data.drawers
  } else {
    console.log('No data in KV, using defaults')
    drawers.value = DRAWERS.map(d => ({
      name: d.name,
      icon: d.icon,
      items: d.items.map(name => ({ name, checked: false }))
    }))
  }
}

const saveList = async () => {
  saving.value = true
  console.log('Saving to KV:', drawers.value)
  await $fetch('/api/list', { method: 'POST', body: { drawers: drawers.value } })
  console.log('Saved successfully')
  saving.value = false
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
            <UPinInput v-model="pin" :length="4" type="number" mask otp placeholder="○" size="xl" @complete="onPinComplete" :disabled="loading" />
            <p v-if="loading" class="text-sm text-gray-500">Verifying...</p>
          </div>
        </UCard>
      </UContainer>
    </UMain>

    <UMain v-else>
      <UContainer class="py-4 space-y-4">
        <div class="flex justify-between items-center sticky top-0 bg-white dark:bg-gray-950 py-3 z-10">
          <h1 class="text-2xl font-bold">Prep List</h1>
          <UButton @click="saveList" :loading="saving" icon="i-heroicons-check" size="lg" color="primary">Save</UButton>
        </div>

        <UAccordion :items="accordionItems" :default-open="0" multiple>
          <template v-for="(drawer, dIdx) in drawers" :key="dIdx" #[`drawer-${dIdx}`]>
            <div class="p-4">
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <UCheckbox v-for="(item, iIdx) in drawer.items" :key="iIdx" :model-value="item.checked" @update:model-value="toggleItem(dIdx, iIdx)" variant="card" size="sm">
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
