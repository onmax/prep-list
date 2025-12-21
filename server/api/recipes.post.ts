export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Expires', '0')

  const { categories, version } = await readBody(event)
  const data = { categories, version, updatedAt: Date.now() }
  console.log('POST /api/recipes - Saving to KV:', data)
  await hubKV().set('recipes-book', data)
  console.log('POST /api/recipes - Saved successfully')

  return { success: true }
})
