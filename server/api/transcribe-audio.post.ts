import { parseRecipeWithAI } from '../utils/parse-recipe'

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)

  if (!formData || formData.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No audio file provided'
    })
  }

  const audioFile = formData.find(part => part.name === 'audio')
  if (!audioFile || !audioFile.data) {
    throw createError({
      statusCode: 400,
      message: 'Audio file is required'
    })
  }

  // Check file size (max 10MB)
  if (audioFile.data.length > 10 * 1024 * 1024) {
    throw createError({
      statusCode: 400,
      message: 'Audio file too large (max 10MB)'
    })
  }

  // Get Cloudflare AI binding
  const cloudflare = (event.context as { cloudflare?: { env?: { AI?: unknown } } }).cloudflare
  if (!cloudflare?.env?.AI) {
    throw createError({
      statusCode: 500,
      message: 'Audio transcription not available (Workers AI not configured)'
    })
  }

  const ai = cloudflare.env.AI as {
    run: (model: string, input: { audio: number[] }) => Promise<{ text?: string }>
  }

  try {
    // Convert Buffer to array of numbers for Whisper
    const audioArray = [...new Uint8Array(audioFile.data)]

    // Transcribe with Whisper
    const transcription = await ai.run('@cf/openai/whisper-large-v3-turbo', {
      audio: audioArray
    })

    const transcribedText = transcription.text?.trim()
    if (!transcribedText) {
      throw createError({
        statusCode: 500,
        message: 'Failed to transcribe audio. Please try again.'
      })
    }

    // Parse the transcribed text as a recipe
    const parsed = await parseRecipeWithAI(event, transcribedText)

    return {
      transcription: transcribedText,
      ingredients: parsed?.ingredients || [],
      instructions: parsed?.instructions || ''
    }
  }
  catch (error) {
    console.error('Audio transcription failed:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to process audio. Please try again.'
    })
  }
})
