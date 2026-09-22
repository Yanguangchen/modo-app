/* Published organization guidance. Pilot seed until the Firestore knowledge
   collection exists; only `published` articles are ever retrievable. */
export type Article = {
  id: string; title: string; summary: string; body: string; owner: string; source: string
  version: string; lastReviewed: string; nextReview: string; tags: string[]; state: 'published' | 'draft'
}

/** Pilot seed, written to Firestore by `npm run seed`. Retrieval reads Firestore, not this list. */
export const seedArticles: Article[] = [
  {
    id: 'k1', title: 'Writing explicit requests', state: 'published',
    summary: 'State the action, the output, the owner, and the time. Avoid “when you get a chance”.',
    body: 'A clear request answers four questions: What should be done? What should the result look like? Who is doing it? When is it needed? Replace relative time words such as “soon” or “ASAP” with a specific time. If a request is optional, say so.',
    owner: 'People & Culture', source: 'Inclusive Communication Handbook §2', version: 'v3.1',
    lastReviewed: '2026-06-02', nextReview: '2026-12-02', tags: ['communication', 'templates', 'request', 'deadline', 'urgency'],
  },
  {
    id: 'k2', title: 'Running predictable meetings', state: 'published',
    summary: 'Share purpose, outcome, agenda, and expected contributions at least one working day ahead.',
    body: 'Every invitation should say why the meeting exists and what decision or output is expected. List each person’s expected contribution. Allow processing time: it is fine to pause for questions and to follow up in writing.',
    owner: 'Operations', source: 'Meeting Standards', version: 'v2.0',
    lastReviewed: '2026-03-14', nextReview: '2026-09-14', tags: ['meetings', 'managers', 'agenda'],
  },
  {
    id: 'k3', title: 'Giving useful feedback', state: 'published',
    summary: 'Specific, written, and paired with an example. Offer time to respond.',
    body: 'Describe the observed work, not the person. Give one concrete example and one concrete suggestion. Ask the colleague how they prefer to receive feedback — their Working Guide may already say.',
    owner: 'People & Culture', source: 'Manager Guide §5', version: 'v1.4',
    lastReviewed: '2026-08-20', nextReview: '2027-02-20', tags: ['feedback', 'managers', 'review'],
  },
  {
    id: 'k4', title: 'Requesting a workplace adjustment', state: 'published',
    summary: 'The formal route for adjustments. You do not need a diagnosis to ask.',
    body: 'Adjustments can be requested through your manager or directly with HR. You can describe what helps without naming a condition. This app does not make or record accommodation decisions.',
    owner: 'HR Services', source: 'Workplace Adjustments Policy', version: 'v4.0',
    lastReviewed: '2026-05-01', nextReview: '2026-11-01', tags: ['policy', 'support', 'adjustment', 'accommodation', 'hr'],
  },
]

const stop = new Set('a an and are as at be but by can do for from how i if in is it me my of on or so that the this to we what when with you your'.split(' '))
const words = (s: string) => s.toLowerCase().match(/[a-z][a-z'-]+/g)?.filter(w => w.length > 2 && !stop.has(w)) ?? []
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '')

/** Keyword retrieval over published articles only. Returns the best matches with a positive score. */
export function retrieve(query: string, articles: Article[] = seedArticles, limit = 3): Article[] {
  const q = new Set(words(query).map(stem))
  if (!q.size) return []
  return articles
    .filter(a => a.state === 'published')
    .map(a => {
      const title = words(a.title).map(stem)
      const tags = a.tags.flatMap(t => words(t)).map(stem)
      const text = words(`${a.summary} ${a.body}`).map(stem)
      let score = 0
      for (const w of q) {
        if (title.includes(w)) score += 3
        if (tags.includes(w)) score += 3
        if (text.includes(w)) score += 1
      }
      return { a, score }
    })
    .filter(x => x.score >= 2)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(x => x.a)
}

/** The document header format from REQUIREMENTS §6. */
export const asDocument = (a: Article) =>
  `Document id: ${a.id}\nTitle: ${a.title}\nOwner: ${a.owner}\nSource: ${a.source}\nVersion: ${a.version}\nLast reviewed: ${a.lastReviewed}\nNext review: ${a.nextReview}\n\n${a.body}`

const cache = new Map<string, { list: Article[]; exp: number }>()

/** Published articles for a tenant, cached briefly. Drafts are never returned. */
export async function publishedArticles(tenantId: string): Promise<Article[]> {
  const hit = cache.get(tenantId)
  if (hit && hit.exp > Date.now()) return hit.list
  const { paths } = await import('./firebase.js')
  const snap = await paths.knowledge(tenantId).where('state', '==', 'published').get()
  const list = snap.docs.map(d => ({ ...(d.data() as Article), id: d.id }))
  cache.set(tenantId, { list, exp: Date.now() + 60_000 })
  return list
}
export const forgetKnowledge = (tenantId: string) => cache.delete(tenantId)
