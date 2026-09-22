import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { z } from 'zod'
import { config } from './config.js'
import { ApiError } from './errors.js'
import { log } from './log.js'

let client: GoogleGenAI | null = null
function vertex() {
  // Vertex AI with Application Default Credentials: gcloud ADC locally, the runtime
  // service account on Cloud Run. No API key exists anywhere in this system.
  client ??= new GoogleGenAI({ vertexai: true, project: config.projectId, location: config.vertexLocation })
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
    const res = await vertex().models.generateContent({
      model: config.vertexModel,
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
      log('WARNING', 'ai_timeout', { route, ms, model: config.vertexModel })
      throw new ApiError(504, 'ai_timeout', 'The AI took too long. Try again, or shorten the text.')
    }
    const status = (err as { status?: number }).status
    log('ERROR', 'ai_error', { route, ms, model: config.vertexModel, code: String(status ?? 'unknown') })
    if (status === 401 || status === 403) throw new ApiError(503, 'ai_not_authorized', 'The AI service is not authorized for this project yet.')
    if (status === 429) throw new ApiError(429, 'ai_busy', 'The AI service is busy. Try again in a moment.')
    throw new ApiError(502, 'ai_unavailable', 'The AI service could not respond. Your text is still here; try again.')
  } finally {
    clearTimeout(timer)
  }

  let parsed: unknown
  try { parsed = JSON.parse(text ?? '') } catch { parsed = undefined }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    log('WARNING', 'ai_schema_reject', { route, ms: Date.now() - started, model: config.vertexModel })
    throw new ApiError(502, 'ai_invalid_output', 'The AI returned something unusable. Try again.')
  }
  log('INFO', 'ai_ok', { route, ms: Date.now() - started, model: config.vertexModel })
  return result.data
}
