import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// Local runs read the repo-root env files. Cloud Run injects real env vars and has neither file.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
for (const name of ['.env.local', '.env']) {
  const path = resolve(root, name)
  if (existsSync(path)) dotenv.config({ path, quiet: true })
}

const str = (name: string, fallback = '') => (process.env[name] ?? fallback).trim()
const bool = (name: string, fallback = false) => {
  const v = str(name)
  return v ? v === 'true' : fallback
}
const num = (name: string, fallback: number) => {
  const n = Number(str(name))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const config = {
  appEnv: str('APP_ENV', 'local'),
  port: num('PORT', 3001),
  corsOrigins: str('CORS_ORIGINS', 'http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean),
  projectId: str('GCP_PROJECT_ID'),
  region: str('GCP_REGION'),
  firebaseProjectId: str('FIREBASE_PROJECT_ID') || str('GCP_PROJECT_ID'),
  mfaRequired: bool('MFA_REQUIRED', true),
  vertexLocation: str('VERTEX_LOCATION', 'global'),
  vertexModel: str('VERTEX_MODEL', 'gemini-3-flash-preview'),
  aiTimeoutMs: num('AI_REQUEST_TIMEOUT_MS', 8000),
  aiMaxOutputTokens: num('AI_MAX_OUTPUT_TOKENS', 4096),
  guide: {
    enabled: bool('GUIDE_AI_ENABLED', true),
    promptPath: resolve(root, str('GUIDE_AI_PROMPT_PATH', 'backend/prompts/communication-coach.md')),
    useWorkingGuide: bool('GUIDE_AI_USE_WORKING_GUIDE', true),
    usePublishedKnowledge: bool('GUIDE_AI_USE_PUBLISHED_KNOWLEDGE', true),
    requireCitations: bool('GUIDE_AI_REQUIRE_CITATIONS', true),
    webSearch: bool('GUIDE_AI_WEB_SEARCH', false),
    allowActions: bool('GUIDE_AI_ALLOW_ACTIONS', false),
    maxHistory: num('GUIDE_AI_MAX_HISTORY_MESSAGES', 12),
    timeoutMs: num('GUIDE_AI_TIMEOUT_MS', 15000),
  },
  locks: {
    messageImport: bool('ENABLE_MESSAGE_IMPORT'),
    transcription: bool('ENABLE_TRANSCRIPTION'),
  },
  promptsDir: resolve(root, 'backend', 'prompts'),
  firestoreDatabaseId: str('FIRESTORE_DATABASE_ID', '(default)'),
  kmsKeyName: str('KMS_KEY_NAME'),
  /** Pilot tenant that invited users join on first sign-in. */
  pilotTenantId: str('PILOT_TENANT_ID', 'pilot'),
  /** Emails always admitted as super-admins (member, admin, knowledge owner). */
  bootstrapAdmins: str('BOOTSTRAP_ADMINS').split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
  apiPublicUrl: str('API_PUBLIC_URL'),
  retention: {
    privateDays: num('RETENTION_PRIVATE_DAYS', 30),
    sharedDays: num('RETENTION_SHARED_DAYS', 30),
    auditDays: num('RETENTION_AUDIT_DAYS', 365),
    invoker: str('RETENTION_INVOKER_SERVICE_ACCOUNT'),
  },
}

/** Refuse to boot in unsafe or incomplete configurations (REQUIREMENTS §13). */
export function assertBootable() {
  const problems: string[] = []
  if (config.locks.messageImport) problems.push('ENABLE_MESSAGE_IMPORT must be false for the pilot')
  if (config.locks.transcription) problems.push('ENABLE_TRANSCRIPTION must be false for the pilot')
  if (!config.region) problems.push('GCP_REGION is required')
  if (!config.projectId) problems.push('GCP_PROJECT_ID is required')
  if (config.guide.webSearch) problems.push('GUIDE_AI_WEB_SEARCH must stay false')
  if (config.guide.allowActions) problems.push('GUIDE_AI_ALLOW_ACTIONS must stay false')
  if (config.appEnv === 'production') {
    if (!config.mfaRequired) problems.push('MFA_REQUIRED must be true in production')
    if (config.corsOrigins.some(o => o.startsWith('http://'))) problems.push('CORS_ORIGINS must be https in production')
    if (!config.kmsKeyName) problems.push('KMS_KEY_NAME is required in production')
    if (!config.retention.invoker) problems.push('RETENTION_INVOKER_SERVICE_ACCOUNT is required in production')
    if (!config.apiPublicUrl) problems.push('API_PUBLIC_URL is required in production')
  }
  if (problems.length) throw new Error(`Refusing to start:\n- ${problems.join('\n- ')}`)
}
