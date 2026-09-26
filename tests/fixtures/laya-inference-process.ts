import { createInterface } from 'node:readline'
import { z } from 'zod'

const lines = createInterface({ input: process.stdin })
const line = await new Promise<string>((done) => lines.once('line', done))
lines.close()
const config = z
  .object({
    token: z.string(),
    instanceId: z.string(),
    runtimeVersion: z.string(),
    models: z.record(z.string(), z.string()),
  })
  .parse(JSON.parse(line))
const requestSchema = z.object({
  state: z.unknown(),
  model: z.string(),
  questions: z.record(
    z.string(),
    z.object({
      type: z.enum(['choice', 'score']),
      criteria: z.union([z.record(z.string(), z.string()), z.array(z.string())]),
    }),
  ),
})

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(req) {
    if (req.headers.get('authorization') !== `Bearer ${config.token}`)
      return new Response('unauthorized', { status: 401 })
    if (new URL(req.url).pathname === '/health')
      return Response.json({
        status: 'ok',
        instanceId: config.instanceId,
        runtimeVersion: config.runtimeVersion,
        loaded: Object.keys(config.models),
      })
    const body = requestSchema.parse(await req.json())
    if (body.state === 'crash') process.exit(7)
    if (body.state === 'hang') await new Promise<void>(() => {})
    if (body.state === 'delay') await new Promise<void>((done) => setTimeout(done, 200))
    if (body.state === 'malformed') return new Response('{broken')
    if (body.state === 'oversize') return new Response(' '.repeat(150_000))
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([id, question]): [string, unknown] => [
        id,
        question.type === 'score'
          ? {
              type: 'score',
              score: 0.9,
              probabilities: { '0': 0.1, '1': 0.9 },
              confidence: 0.5,
              answer_confidence: 0.9,
            }
          : {
              type: 'choice',
              choice: 'B',
              probabilities: { A: 0.1, B: 0.9 },
              confidence: 0.5,
              answer_confidence: 0.9,
              action: { act_probability: 1 },
            },
      ]),
    )
    return Response.json({
      routing: { model: body.model },
      answers,
      hbar_input: {
        state_truncated: body.state === 'truncated',
        questions_truncated: body.state === 'truncated' ? Object.keys(body.questions) : [],
      },
    })
  },
})
console.log('hbar-laya-ready ' + JSON.stringify({ port: server.port, instanceId: config.instanceId }))
process.once('SIGTERM', () => {
  server.stop(true).then(
    () => process.exit(0),
    () => process.exit(1),
  )
})
