import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { Generate } from './ai.js'
import { config } from './config.js'
import type { Article } from './knowledge.js'
import { asDocument, retrieve } from './knowledge.js'

export const GuideRequest = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).max(40).default([]),
  context: z.object({ workingGuide: z.boolean().default(false), publishedKnowledge: z.boolean().default(true) }).default({ workingGuide: false, publishedKnowledge: true }),
})

/** Context Cloud Run fetched for this caller: never supplied by the browser. */
export type GuideContext = { articles: Article[]; workingGuide: { label: string; value: string }[] }

const GuideOutput = z.object({
  answer: z.string(),
  citedDocumentIds: z.array(z.string()),
})

let coach: string | null = null
function coachInstructions() {
  // Only the agent section; the retrieval instruction at the bottom is for a separate search step.
  coach ??= readFileSync(config.guide.promptPath, 'utf8').split('## Retrieval instruction')[0]
  return coach
}

export async function guideChat(
  req: z.infer<typeof GuideRequest> & { workingGuide?: { label: string; value: string }[] },
  generate: Generate,
  ctx?: Partial<GuideContext>,
) {
  const history = req.history.slice(-config.guide.maxHistory)
  const useKnowledge = config.guide.usePublishedKnowledge && req.context.publishedKnowledge
  const workingGuideItems = ctx?.workingGuide ?? req.workingGuide ?? []
  const useGuide = config.guide.useWorkingGuide && req.context.workingGuide && workingGuideItems.length > 0

  const recentUser = history.filter(m => m.role === 'user').slice(-2).map(m => m.content).join(' ')
  const docs = useKnowledge ? retrieve(`${req.message} ${recentUser}`, ctx?.articles) : []

  const system = [
    coachInstructions(),
    '## Output',
    'Return JSON with `answer` (plain text, no markdown headings; short paragraphs and simple dash lists are fine) and `citedDocumentIds` (ids of the documents below that you actually used; empty if none).',
    useKnowledge
      ? (docs.length
        ? 'Organization guidance is provided below. Cite the title, owner, and version inside the answer for anything you use.'
        : 'No published organization guidance matched this question. Say that the organization guidance does not cover it, then offer general practice labeled as general practice.')
      : 'Organization guidance is turned off for this conversation. Label any advice as general practice.',
  ].join('\n\n')

  const parts: string[] = []
  if (docs.length) {
    parts.push('<organization_guidance untrusted="true">', ...docs.map(asDocument).map(d => `<document>\n${d}\n</document>`), '</organization_guidance>')
  }
  if (useGuide) {
    parts.push(
      '<my_working_guide untrusted="true">',
      'These are the asking user\'s own preferences, which they chose to include:',
      ...workingGuideItems.map(f => `- ${f.label}: ${f.value}`),
      '</my_working_guide>',
    )
  }
  if (history.length) {
    parts.push('<conversation>', ...history.map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`), '</conversation>')
  }
  parts.push(`User question: ${req.message}`)

  const out = await generate({ system, user: parts.join('\n'), schema: GuideOutput, timeoutMs: config.guide.timeoutMs, route: 'guide_chat', temperature: 0.5 })

  // Citations come only from documents this request actually retrieved.
  const cited = docs.filter(d => out.citedDocumentIds.includes(d.id))
  return {
    answer: out.answer.trim(),
    citations: cited.map(d => ({ title: d.title, owner: d.owner, version: d.version })),
    grounded: cited.length > 0,
  }
}
