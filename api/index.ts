type Handler = (req: Request) => Response | Promise<Response>
let handler: Promise<Handler> | undefined

// Use Vercel's Web Standard export: a bare default function receives Node req/res.
export default {
  async fetch(req: Request) {
    handler ??= import('../backend/src/vercel.js').then(mod => mod.default as Handler)
    return (await handler)(req)
  },
}
