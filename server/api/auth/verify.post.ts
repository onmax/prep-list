export default defineEventHandler(async (event) => {
  const { pin } = await readBody(event)
  const correctPin = useRuntimeConfig().pinCode || '1234'

  console.log('PIN check:', { received: pin, expected: correctPin, match: pin === correctPin })

  if (pin === correctPin) {
    setCookie(event, 'prep-auth', 'verified', { httpOnly: true, maxAge: 60 * 60 * 24 * 7 })
    return { success: true }
  }

  return { success: false }
})
