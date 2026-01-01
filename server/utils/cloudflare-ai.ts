import type { H3Event } from 'h3'

interface CloudflareAI {
  run: (model: string, input: { prompt?: string, messages?: Array<{ role: string, content: string }> }) => Promise<{ response?: string }>
}

/**
 * Gets the Cloudflare Workers AI binding from the event context.
 * Only available when running on Cloudflare Workers with AI binding configured.
 */
export function getCloudflareAI(event: H3Event): CloudflareAI {
  const cloudflare = (event.context as { cloudflare?: { env?: { AI?: CloudflareAI } } }).cloudflare

  if (!cloudflare?.env?.AI) {
    throw new Error('Workers AI not available. Make sure AI binding is configured in nuxt.config.ts')
  }

  return cloudflare.env.AI
}

/**
 * Checks if Workers AI is available in the current environment.
 */
export function hasCloudflareAI(event: H3Event): boolean {
  const cloudflare = (event.context as { cloudflare?: { env?: { AI?: CloudflareAI } } }).cloudflare
  return !!cloudflare?.env?.AI
}
