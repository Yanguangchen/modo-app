/* Structured logs for Cloud Logging. By construction these carry identifiers,
   timings, status codes, and policy outcomes only — never prompts, bodies, or model output. */
type Fields = { route?: string; status?: number; ms?: number; code?: string; uid?: string; model?: string; [k: string]: string | number | boolean | undefined }

const hashUid = (uid?: string) => {
  if (!uid) return undefined
  let h = 0
  for (const c of uid) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0
  return `u_${(h >>> 0).toString(36)}`
}

export function log(severity: 'INFO' | 'WARNING' | 'ERROR', message: string, fields: Fields = {}) {
  const { uid, ...rest } = fields
  console.log(JSON.stringify({ severity, message, uid: hashUid(uid), ...rest }))
}
