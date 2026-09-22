import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { z } from 'zod'
import { config } from './config.js'
import { ApiError } from './errors.js'
import { log } from './log.js'

let client: GoogleGenAI | null = null
function studio() {
  // Google AI Studio (Gemini API). The key stays on the API process, never in the browser.
  client ??= new GoogleGenAI({ apiKey: config.geminiApiKey })
  return client
}

export type Generate = <T>(args: {
  system: string
  user: string
  schema: z.ZodType<T>
  timeoutMs: number
  route: string
  temperature?: number
}) => Promise<T>

/** Calls Gemini for a JSON object and validates it against the zod schema before anyone sees it. */
export const generateJson: Generate = async ({ system, user, schema, timeoutMs, route, temperature = 0.3 }) => {
  const started = Date.now()
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  let text: string | undefined
  try {
    const res = await studio().models.generateContent({
      model: config.geminiModel,
      contents: [{ role: 'user', parts: [{ text: user }] }],
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(schema, { target: 'draft-7' }),
        temperature,
        maxOutputTokens: config.aiMaxOutputTokens,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: abort.signal,
      },
    })
    text = res.text
  } catch (err) {
    const ms = Date.now() - started
    if (abort.signal.aborted) {
      log('WARNING', 'ai_timeout', { route, ms, model: config.geminiModel })
      throw new ApiError(504, 'ai_timeout', 'The AI took too long. Try again, or shorten the text.')
    }
    const status = (err as { status?: number }).status
    log('ERROR', 'ai_error', { route, ms, model: config.geminiModel, code: String(status ?? 'unknown') })
    if (/BILLING_DISABLED|requires billing/i.test(String((err as Error).message))) throw new ApiError(503, 'ai_billing_disabled', 'The Gemini API rejected this request. Check GEMINI_API_KEY. Your text is kept here.')
    if (status === 401 || status === 403) throw new ApiError(503, 'ai_not_authorized', 'The Gemini API key was rejected. Check GEMINI_API_KEY on the API server.')
    if (status === 429) throw new ApiError(429, 'ai_busy', 'The AI service is busy. Try again in a moment.')
    throw new ApiError(502, 'ai_unavailable', 'The AI service could not respond. Your text is still here; try again.')
  } finally {
    clearTimeout(timer)
  }

  let parsed: unknown
  try { parsed = JSON.parse(text ?? '') } catch { parsed = undefined }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    log('WARNING', 'ai_schema_reject', { route, ms: Date.now() - started, model: config.geminiModel })
    throw new ApiError(502, 'ai_invalid_output', 'The AI returned something unusable. Try again.')
  }
  log('INFO', 'ai_ok', { route, ms: Date.now() - started, model: config.geminiModel })
  return result.data
}
