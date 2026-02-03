import { GoogleGenerativeAI } from '@google/generative-ai'
import { getDatabase } from '../database'

let genAI: GoogleGenerativeAI | null = null

/**
 * Initialize Gemini API with key from settings
 */
export function initializeGemini(): boolean {
  const db = getDatabase()
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('gemini_api_key') as
    | { value: string }
    | undefined

  if (!setting || !setting.value) {
    console.warn('Gemini API key not configured')
    return false
  }

  try {
    genAI = new GoogleGenerativeAI(setting.value)
    return true
  } catch (error) {
    console.error('Failed to initialize Gemini:', error)
    return false
  }
}

/**
 * Generate content using Gemini
 */
export async function generateContent(prompt: string): Promise<string> {
  if (!genAI) {
    const initialized = initializeGemini()
    if (!initialized) {
      throw new Error('Gemini API not configured. Add API key in settings.')
    }
  }

  try {
    const model = genAI!.getGenerativeModel({ model: 'gemini-pro' })
    const result = await model.generateContent(prompt)
    const response = await result.response
    return response.text()
  } catch (error: any) {
    throw new Error(`Gemini API error: ${error.message}`)
  }
}

/**
 * Check if Gemini is configured and available
 */
export function isGeminiAvailable(): boolean {
  if (!genAI) {
    return initializeGemini()
  }
  return true
}
