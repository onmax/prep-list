export default defineEventHandler(async (event) => {
  const auth = getCookie(event, 'prep-auth')
  if (auth !== 'verified') throw createError({ statusCode: 401, message: 'Unauthorized' })

  setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate')

  const list = await hubKV().get('prep-list')
  console.log('GET /api/list - Retrieved from KV:', list)
  return list || null
})
