// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxthub/core', '@vueuse/nuxt'],
  hub: { kv: true },
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      wrangler: {
        ai: { binding: 'AI' }
      }
    }
  },
  runtimeConfig: { pinCode: process.env.PIN_CODE || '1234' },
  css: ['~/assets/css/main.css']
})