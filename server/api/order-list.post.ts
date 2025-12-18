export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Expires', '0')

  const { items } = await readBody<{ items: string[] }>(event)
  await hubKV().set('order-list', items || [])

  return { success: true }
})
