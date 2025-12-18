export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Expires', '0')

  const { item } = await readBody<{ item: string }>(event)
  const trimmedItem = item?.trim()

  if (!trimmedItem) {
    return { success: false, error: 'Item is required' }
  }

  // Get existing items
  const existingItems = await hubKV().get<string[]>('order-history') || []

  // Check for duplicate (case-insensitive)
  const isDuplicate = existingItems.some(
    existing => existing.toLowerCase() === trimmedItem.toLowerCase()
  )

  if (isDuplicate) {
    return { success: true, duplicate: true }
  }

  // Add new item
  existingItems.push(trimmedItem)
  await hubKV().set('order-history', existingItems)

  return { success: true, duplicate: false }
})
