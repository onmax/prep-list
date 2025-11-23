export default defineEventHandler(async (event) => {
  const auth = getCookie(event, 'prep-auth')
  if (auth !== 'verified') throw createError({ statusCode: 401, message: 'Unauthorized' })

  const { drawers } = await readBody(event)
  await hubKV().set('prep-list', { drawers, updatedAt: Date.now() })

  return { success: true }
})
