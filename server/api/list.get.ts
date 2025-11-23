export default defineEventHandler(async (event) => {
  const auth = getCookie(event, 'prep-auth')
  if (auth !== 'verified') throw createError({ statusCode: 401, message: 'Unauthorized' })

  const list = await hubKV().get('prep-list')
  return list || null
})
