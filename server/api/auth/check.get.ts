export default defineEventHandler((event) => {
  const auth = getCookie(event, 'prep-auth')
  return { authenticated: auth === 'verified' }
})
