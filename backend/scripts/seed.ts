/* Seeds the pilot tenant: admin list, optional invites, and published knowledge.
   Usage: npm run seed -- [--invite a@b.com,c@d.com]
   Uses Application Default Credentials, or the emulators when FIRESTORE_EMULATOR_HOST is set. */
import { FieldValue } from 'firebase-admin/firestore'
import { config } from '../src/config.js'
import { paths } from '../src/firebase.js'
import { seedArticles } from '../src/knowledge.js'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] ?? '' : ''
}

const tenantId = config.pilotTenantId
const admins = config.bootstrapAdmins
const invites = arg('invite').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

await paths.tenant(tenantId).set({
  name: 'Pilot',
  admins: FieldValue.arrayUnion(...admins),
  ...(invites.length ? { invites: FieldValue.arrayUnion(...invites) } : {}),
  retention: config.retention,
  updatedAt: new Date().toISOString(),
}, { merge: true })

for (const a of seedArticles) {
  const { id, ...rest } = a
  await paths.knowledge(tenantId).doc(id).set({ ...rest, dataDomain: 'published', updatedAt: new Date().toISOString() }, { merge: true })
}

console.log(JSON.stringify({ tenantId, admins: admins.length, invites: invites.length, articles: seedArticles.length, target: process.env.FIRESTORE_EMULATOR_HOST ? 'emulator' : config.projectId }))
