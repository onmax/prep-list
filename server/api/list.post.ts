export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Expires', '0')

  const { drawers, version } = await readBody(event)
  const data = { drawers, version, updatedAt: Date.now() }
  console.log('POST /api/list - Saving to KV:', data)
  await hubKV().set('prep-list', data)
  console.log('POST /api/list - Saved successfully')

  return { success: true }
})
