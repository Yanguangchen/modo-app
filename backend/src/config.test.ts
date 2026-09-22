import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertBootable, config } from './config.js'

describe('config.assertBootable', () => {
  // Snapshot original config values to restore after each test
  let originalConfig: {
    region: string
    projectId: string
    appEnv: string
    corsOrigins: string[]
    locks: { messageImport: boolean; transcription: boolean }
    guide: { webSearch: boolean; allowActions: boolean }
    kmsKeyName: string
    appEncryptionKey: string
    apiPublicUrl: string
    retentionInvoker: string
    geminiApiKey: string
  }

  beforeEach(() => {
    originalConfig = {
      region: config.region,
      projectId: config.projectId,
      appEnv: config.appEnv,
      corsOrigins: [...config.corsOrigins],
      locks: { ...config.locks },
      guide: {
        webSearch: config.guide.webSearch,
        allowActions: config.guide.allowActions,
      },
      kmsKeyName: config.kmsKeyName,
      appEncryptionKey: config.appEncryptionKey,
      apiPublicUrl: config.apiPublicUrl,
      retentionInvoker: config.retention.invoker,
      geminiApiKey: config.geminiApiKey,
    }
  })

  afterEach(() => {
    config.region = originalConfig.region
    config.projectId = originalConfig.projectId
    config.appEnv = originalConfig.appEnv
    config.corsOrigins = originalConfig.corsOrigins
    config.locks.messageImport = originalConfig.locks.messageImport
    config.locks.transcription = originalConfig.locks.transcription
    config.guide.webSearch = originalConfig.guide.webSearch
    config.guide.allowActions = originalConfig.guide.allowActions
    config.kmsKeyName = originalConfig.kmsKeyName
    config.appEncryptionKey = originalConfig.appEncryptionKey
    config.apiPublicUrl = originalConfig.apiPublicUrl
    config.retention.invoker = originalConfig.retentionInvoker
    config.geminiApiKey = originalConfig.geminiApiKey
  })

  it('passes when required fields are present in a safe pilot configuration', () => {
    config.region = 'us-central1'
    config.projectId = 'test-clarity-project'
    config.locks.messageImport = false
    config.locks.transcription = false
    config.guide.webSearch = false
    config.guide.allowActions = false
    config.appEnv = 'local'
    config.geminiApiKey = 'test-key'

    expect(() => assertBootable()).not.toThrow()
  })

  it('refuses to boot if ENABLE_MESSAGE_IMPORT or ENABLE_TRANSCRIPTION are enabled', () => {
    config.region = 'us-central1'
    config.projectId = 'test-clarity-project'
    config.locks.messageImport = true
    config.locks.transcription = true

    expect(() => assertBootable()).toThrow(/ENABLE_MESSAGE_IMPORT must be false/)
    expect(() => assertBootable()).toThrow(/ENABLE_TRANSCRIPTION must be false/)
  })

  it('refuses to boot if GEMINI_API_KEY is missing', () => {
    config.region = 'us-central1'
    config.projectId = 'test-clarity-project'
    config.geminiApiKey = ''
    config.locks.messageImport = false
    config.locks.transcription = false

    expect(() => assertBootable()).toThrow(/GEMINI_API_KEY is required/)
  })

  it('refuses to boot if GCP_REGION or GCP_PROJECT_ID are missing', () => {
    config.region = ''
    config.projectId = ''
    config.locks.messageImport = false
    config.locks.transcription = false

    expect(() => assertBootable()).toThrow(/GCP_REGION is required/)
    expect(() => assertBootable()).toThrow(/GCP_PROJECT_ID is required/)
  })

  it('refuses to boot if guide webSearch or allowActions are enabled', () => {
    config.region = 'us-central1'
    config.projectId = 'test-clarity-project'
    config.guide.webSearch = true
    config.guide.allowActions = true

    expect(() => assertBootable()).toThrow(/GUIDE_AI_WEB_SEARCH must stay false/)
    expect(() => assertBootable()).toThrow(/GUIDE_AI_ALLOW_ACTIONS must stay false/)
  })

  it('enforces HTTPS CORS origins, key wrapping, and retention in production', () => {
    config.region = 'us-central1'
    config.projectId = 'test-clarity-project'
    config.appEnv = 'production'
    config.corsOrigins = ['http://insecure.example.com', 'https://secure.example.com']
    config.kmsKeyName = ''
    config.appEncryptionKey = ''
    config.retention.invoker = ''
    config.apiPublicUrl = ''

    expect(() => assertBootable()).toThrow(/CORS_ORIGINS must be https in production/)
    expect(() => assertBootable()).toThrow(/KMS_KEY_NAME or a 32-byte base64 APP_ENCRYPTION_KEY is required in production/)
    expect(() => assertBootable()).toThrow(/RETENTION_INVOKER_SERVICE_ACCOUNT is required in production/)
    expect(() => assertBootable()).toThrow(/API_PUBLIC_URL is required in production/)

    // When all are valid in production:
    config.corsOrigins = ['https://app.clarity.com']
    config.kmsKeyName = 'projects/p/locations/l/keyRings/r/cryptoKeys/k'
    config.retention.invoker = 'retention-cron@serviceaccount.com'
    config.apiPublicUrl = 'https://api.clarity.com'
    config.geminiApiKey = 'test-key'
    expect(() => assertBootable()).not.toThrow()

    // Production may use a server-only wrapping key instead of paid Cloud KMS.
    config.kmsKeyName = ''
    config.appEncryptionKey = Buffer.alloc(32, 1).toString('base64')
    expect(() => assertBootable()).not.toThrow()
  })
})
