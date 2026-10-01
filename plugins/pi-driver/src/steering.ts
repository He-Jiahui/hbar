import { z } from 'zod'
import { contentBlockSchema, idSchema, inputSchema } from '@hbar/contracts'
import type { Message } from '@hbar/contracts'
import type { DriverInput } from '@hbar/plugin-sdk'

export const DRIVER_STEERING_BATCH_LIMIT = 20
export const DRIVER_STEERING_DEADLINE_MS = 5_000

const messageSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  runId: idSchema,
  role: z.literal('user'),
  content: z.array(contentBlockSchema).max(25),
  seq: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  providerData: z.unknown().optional(),
})

type SteeringInput = Pick<DriverInput, 'session' | 'run' | 'request' | 'signal' | 'getSteeringMessages'>

/** A bounded, Run-owned adapter. Its caller translates failure into the Pi loop's
 * no-rejection polling contract, then fails the Run before any new inference. */
export function createDriverSteeringReader(input: SteeringInput) {
  const seen = new Map(input.request.messages.map((message) => [message.id, message.seq]))
  let lastSequence = input.request.messages.reduce((last, message) => Math.max(last, message.seq), 0)
  let failed = false

  return async (): Promise<Message[]> => {
    if (!input.getSteeringMessages || failed) return []
    input.signal.throwIfAborted()
    const lifetime = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    try {
      const interrupted = new Promise<never>((_resolve, reject) => {
        onAbort = () => {
          const reason: unknown = input.signal.reason
          lifetime.abort(reason)
          reject(reason ?? new Error('Run steering was cancelled'))
        }
        input.signal.addEventListener('abort', onAbort, { once: true })
        timer = setTimeout(() => {
          const reason = new Error('Run steering read exceeded its deadline')
          lifetime.abort(reason)
          reject(reason)
        }, DRIVER_STEERING_DEADLINE_MS)
        if (input.signal.aborted) onAbort()
      })
      const source = input.getSteeringMessages
      const raw = await Promise.race([
        Promise.resolve().then(() => {
          lifetime.signal.throwIfAborted()
          return source({ sessionId: input.session.id, runId: input.run.id, signal: lifetime.signal })
        }),
        interrupted,
      ])
      input.signal.throwIfAborted()
      const messages = z.array(messageSchema).max(DRIVER_STEERING_BATCH_LIMIT).parse(raw)
      const batchIds = new Set<string>()
      const fresh: Message[] = []
      let nextSequence = lastSequence
      for (const message of messages) {
        if (message.sessionId !== input.session.id || message.runId !== input.run.id)
          throw new Error('Steering message does not belong to the active Run')
        if (batchIds.has(message.id)) throw new Error('Steering batch contains duplicate message identities')
        batchIds.add(message.id)
        if (message.content.some((block) => !['text', 'image', 'file'].includes(block.type)))
          throw new Error('Steering accepts only admitted user content')
        const content = inputSchema.parse({
          text: message.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join(''),
          images: message.content.filter((block) => block.type === 'image').map((block) => block.artifact),
          files: message.content.filter((block) => block.type === 'file').map((block) => block.artifact),
        })
        if (!content.text.trim() && !content.images.length && !content.files?.length)
          throw new Error('Steering cannot introduce an empty user message')
        const previousSequence = seen.get(message.id)
        if (previousSequence !== undefined) {
          if (previousSequence !== message.seq) throw new Error('Steering message identity changed sequence')
          continue
        }
        if (message.seq <= nextSequence) throw new Error('Steering messages must advance canonical sequence')
        nextSequence = message.seq
        fresh.push(message)
      }
      // Validate the whole batch before accepting any identity. This is local
      // delivery de-duplication, not a durable queue reservation or receipt.
      for (const message of fresh) seen.set(message.id, message.seq)
      lastSequence = nextSequence
      return fresh
    } catch (error) {
      failed = true
      throw error ?? new Error('Run steering source failed')
    } finally {
      if (timer) clearTimeout(timer)
      if (onAbort) input.signal.removeEventListener('abort', onAbort)
      lifetime.abort()
    }
  }
}
