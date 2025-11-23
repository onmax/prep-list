export default defineEventHandler(async (event) => {
  const auth = getCookie(event, 'prep-auth')
  if (auth !== 'verified') throw createError({ statusCode: 401, message: 'Unauthorized' })

  const { drawers } = await readBody(event)
  const data = { drawers, updatedAt: Date.now() }
  console.log('POST /api/list - Saving to KV:', data)
  await hubKV().set('prep-list', data)
  console.log('POST /api/list - Saved successfully')

  return { success: true }
})
