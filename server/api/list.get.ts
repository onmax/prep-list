export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Expires', '0')

  const list = await hubKV().get('prep-list')
  console.log('GET /api/list - Retrieved from KV:', list)
  return list || null
})
