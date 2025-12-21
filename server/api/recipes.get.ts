export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Expires', '0')

  const recipes = await hubKV().get('recipes-book')
  console.log('GET /api/recipes - Retrieved from KV:', recipes)
  return recipes || null
})
