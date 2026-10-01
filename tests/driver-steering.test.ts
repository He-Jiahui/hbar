import { expect, test } from 'bun:test'
import { providerSchema, runSchema, sessionSchema, workspaceSchema } from '@hbar/contracts'
import type { ContentBlock, Message, SessionEvent } from '@hbar/contracts'
import type { DriverInput } from '@hbar/plugin-sdk'
import { PiDriver } from '@hbar/pi-driver'
import {
  createDriverSteeringReader,
  DRIVER_STEERING_BATCH_LIMIT,
  DRIVER_STEERING_DEADLINE_MS,
} from '../plugins/pi-driver/src/steering'

function fixture() {
  const controller = new AbortController()
  const session = sessionSchema.parse({
    id: 'session',
    workspaceId: 'workspace',
    title: 'Fixture',
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 0,
  })
  const workspace = workspaceSchema.parse({ id: 'workspace', name: 'Fixture', path: '.', createdAt: 1 })
  const run = runSchema.parse({
    id: 'active-run',
    sessionId: session.id,
    requestId: 'original-request',
    input: { text: 'Original task', images: [] },
    modelId: 'fixture',
    status: 'running',
    createdAt: 1,
    startedAt: 1,
    endedAt: null,
    error: null,
  })
  const model = providerSchema.parse({
    id: 'fixture',
    name: 'Local fixture',
    protocol: 'mock',
    model: 'fixture',
    baseUrl: 'http://localhost',
  })
  let sequence = 0
  const messages: Message[] = []
  const requests: Message[][] = []
  const events: SessionEvent[] = []
  const commit = (
    role: Message['role'],
    content: ContentBlock[],
    id: string = crypto.randomUUID(),
    providerData?: unknown,
  ): Message => {
    const message: Message = {
      id,
      sessionId: session.id,
      runId: run.id,
      role,
      content,
      seq: ++sequence,
      createdAt: sequence,
      ...(providerData === undefined ? {} : { providerData }),
    }
    messages.push(message)
    return message
  }
  const original = commit('user', [{ type: 'text', text: run.input.text }], 'original-message')
  const input: DriverInput = {
    session,
    workspace,
    run,
    signal: controller.signal,
    request: { system: 'Local fixture instructions', model, messages: [original] },
    tools: [],
    apiKey: null,
    resolveKey: () => Promise.resolve(null),
    readImage: () => Promise.reject(new Error('No image fixture')),
    readFile: () => Promise.reject(new Error('No file fixture')),
    emit: (type, data, stepId) => {
      const event: SessionEvent = {
        eventId: crypto.randomUUID(),
        sessionId: session.id,
        runId: run.id,
        stepId: stepId ?? null,
        type,
        data,
        time: 1,
        version: 1,
        seq: ++sequence,
      }
      events.push(event)
      return Promise.resolve(event)
    },
    commit: (role, content, id, providerData) => Promise.resolve(commit(role, content, id, providerData)),
    stream: () => {},
    execute: () => Promise.reject(new Error('No tool fixture')),
    beforeRequest: () => {
      const history = structuredClone(messages)
      requests.push(history)
      return Promise.resolve({ ...input.request, messages: history })
    },
    stepEnded: () => Promise.resolve(),
  }
  return {
    input,
    controller,
    original,
    messages,
    requests,
    events,
    commit,
    reader: () => createDriverSteeringReader(input),
  }
}

test('canonical steering continues the same Run after its assistant turn without another user commit', async () => {
  const f = fixture()
  let delivered: Message | undefined
  const targets: { sessionId: string; runId: string }[] = []
  f.input.getSteeringMessages = (target) => {
    targets.push({ sessionId: target.sessionId, runId: target.runId })
    expect(target.signal.aborted).toBe(false)
    if (f.requests.length === 0) return Promise.resolve([])
    if (!delivered) delivered = f.commit('user', [{ type: 'text', text: 'Refine this same task' }], 'steer-message')
    return Promise.resolve([delivered])
  }
  await new PiDriver().run(f.input)
  expect(f.requests).toHaveLength(2)
  expect(f.requests[1]?.at(-1)).toMatchObject({ id: 'steer-message', role: 'user', runId: 'active-run' })
  expect(f.messages.filter((message) => message.role === 'user')).toHaveLength(2)
  expect(f.messages.filter((message) => message.role === 'assistant')).toHaveLength(2)
  expect(f.messages.at(-1)?.content).toEqual([
    { type: 'text', text: 'Received: Refine this same task\n\nThis response was produced by the local fixture model.' },
  ])
  expect(f.messages.every((message) => message.runId === f.input.run.id)).toBe(true)
  expect(targets.every((target) => target.sessionId === f.input.session.id && target.runId === f.input.run.id)).toBe(
    true,
  )
  expect(f.events.filter((event) => event.type === 'step.started')).toHaveLength(2)
  expect(f.input.run.requestId).toBe('original-request')
})

test('drivers without steering retain the ordinary one-response path', async () => {
  const f = fixture()
  expect(new PiDriver().supportsCanonicalSteering).toBe(true)
  expect(new PiDriver().supportsSteeringAdmissionClosure).toBe(true)
  await new PiDriver().run(f.input)
  expect(f.requests).toHaveLength(1)
  expect(f.messages.filter((message) => message.role === 'user')).toHaveLength(1)
})

test('explicit Goal termination seals admission before the driver returns, without consuming another guide', async () => {
  const f = fixture()
  let closed = false
  let reads = 0
  f.input.getSteeringMessages = () => {
    reads++
    return Promise.resolve([])
  }
  f.input.stepEnded = () => Promise.resolve({ stop: 'goal_complete' })
  f.input.closeSteeringAdmission = () => {
    closed = true
    return Promise.resolve()
  }
  await new PiDriver().run(f.input)
  expect(closed).toBe(true)
  expect(reads).toBe(1)
  expect(f.requests).toHaveLength(1)
})

test('a failed authoritative request seals admission and does not start a replacement request', async () => {
  const f = fixture()
  let closes = 0
  let requests = 0
  f.input.beforeRequest = () => {
    requests++
    return Promise.reject(new Error('Provider context unavailable'))
  }
  f.input.closeSteeringAdmission = () => {
    closes++
    return Promise.resolve()
  }
  await expect(new PiDriver().run(f.input)).rejects.toThrow('Provider context unavailable')
  expect(closes).toBe(1)
  expect(requests).toBe(1)
})

test('an aborted loop seals admission before returning its cancellation', async () => {
  const f = fixture()
  let closes = 0
  f.controller.abort(new Error('Owned cancellation'))
  f.input.closeSteeringAdmission = () => {
    closes++
    return Promise.resolve()
  }
  await expect(new PiDriver().run(f.input)).rejects.toThrow('Owned cancellation')
  expect(closes).toBe(1)
  expect(f.requests).toHaveLength(0)
})

test('the final natural-stop probe consumes a late guide before atomically closing an empty source', async () => {
  const f = fixture()
  const probes: boolean[] = []
  let guided = false
  let closed = false
  f.input.getSteeringMessages = (target) => {
    probes.push(target.closeWhenEmpty === true)
    expect(closed).toBe(false)
    if (target.closeWhenEmpty && !guided) {
      guided = true
      return Promise.resolve([f.commit('user', [{ type: 'text', text: 'Late final-poll guide' }], 'late-guide')])
    }
    if (target.closeWhenEmpty) closed = true
    return Promise.resolve([])
  }
  await new PiDriver().run(f.input)
  expect(probes[0]).toBe(false)
  expect(probes.at(-1)).toBe(true)
  expect(probes.filter(Boolean)).toHaveLength(2)
  expect(closed).toBe(true)
  expect(f.requests).toHaveLength(2)
  expect(f.requests[1]?.at(-1)).toMatchObject({ id: 'late-guide', runId: f.input.run.id })
  expect(f.messages.filter((message) => message.id === 'late-guide')).toHaveLength(1)
})

test('failure at the final closure probe fails the Run rather than reporting natural completion', async () => {
  const f = fixture()
  let physicalReads = 0
  f.input.getSteeringMessages = (target) => {
    physicalReads++
    return target.closeWhenEmpty ? Promise.reject(new Error('Admission gate unavailable')) : Promise.resolve([])
  }
  await expect(new PiDriver().run(f.input)).rejects.toThrow('Admission gate unavailable')
  expect(physicalReads).toBe(3)
  expect(f.requests).toHaveLength(1)
})

test('steering attachments hydrate only for the next authoritative request model', async () => {
  const f = fixture()
  const artifact = { id: 'a'.repeat(64), name: 'guide.png', mime: 'image/png', size: 8 }
  let delivered: Message | undefined
  let imageReads = 0
  f.input.getSteeringMessages = () => {
    if (!f.requests.length) return Promise.resolve([])
    if (!delivered) delivered = f.commit('user', [{ type: 'image', artifact }], 'image-steer')
    return Promise.resolve([delivered])
  }
  const originalRequest = f.input.beforeRequest
  f.input.beforeRequest = async (request, stepId) => {
    const next = await originalRequest(request, stepId)
    return { ...next, model: { ...next.model, imageInput: f.requests.length > 1 } }
  }
  f.input.readImage = () => {
    expect(f.requests).toHaveLength(2)
    imageReads++
    return Promise.resolve({ mime: artifact.mime, data: 'fixture-image-bytes' })
  }
  await new PiDriver().run(f.input)
  expect(f.requests).toHaveLength(2)
  expect(imageReads).toBe(1)
  expect(f.messages.filter((message) => message.id === 'image-steer')).toHaveLength(1)
})

test('Goal completion stays authoritative and is not bypassed to fetch a steering message', async () => {
  const f = fixture()
  let reads = 0
  f.input.getSteeringMessages = () => {
    reads++
    return Promise.resolve([])
  }
  f.input.stepEnded = () => Promise.resolve({ stop: 'goal_complete' })
  await new PiDriver().run(f.input)
  expect(reads).toBe(1)
  expect(f.requests).toHaveLength(1)
})

test('steering source failure after a settled response fails before another provider request', async () => {
  const f = fixture()
  f.input.getSteeringMessages = () =>
    f.requests.length ? Promise.reject(new Error('Canonical read failed')) : Promise.resolve([])
  await expect(new PiDriver().run(f.input)).rejects.toThrow('Canonical read failed')
  expect(f.requests).toHaveLength(1)
  expect(f.messages.filter((message) => message.role === 'user')).toHaveLength(1)
})

test('initial steering read failure cannot fall through to a provider request', async () => {
  const f = fixture()
  f.input.getSteeringMessages = () => Promise.reject(new Error('Initial source failed'))
  await expect(new PiDriver().run(f.input)).rejects.toThrow('Initial source failed')
  expect(f.requests).toHaveLength(0)
})

test('empty and oversized user content cannot create a steering continuation', async () => {
  for (const text of ['', ' '.repeat(10), 'a'.repeat(200_001)]) {
    const f = fixture()
    f.input.getSteeringMessages = () => Promise.resolve([f.commit('user', [{ type: 'text', text }], 'invalid-content')])
    await expect(new PiDriver().run(f.input)).rejects.toThrow()
    expect(f.requests).toHaveLength(0)
  }
})

test('canonical reads de-duplicate original/replayed identities and validate the complete batch', async () => {
  const f = fixture()
  const steer = f.commit('user', [{ type: 'text', text: 'Guide' }], 'steer')
  const later = f.commit('user', [{ type: 'text', text: 'Later guide' }], 'later')
  let batch = [f.original, steer]
  f.input.getSteeringMessages = () => Promise.resolve(batch)
  const read = f.reader()
  expect(await read()).toEqual([steer])
  expect(await read()).toEqual([])
  batch = [steer, later]
  expect(await read()).toEqual([later])
})

for (const boundary of [
  'foreign-session',
  'foreign-run',
  'assistant',
  'tool-content',
  'duplicate',
  'reordered',
  'over-limit',
  'changed-sequence',
] as const) {
  test(`invalid canonical steering fails closed: ${boundary}`, async () => {
    const f = fixture()
    const message = f.commit('user', [{ type: 'text', text: 'Guide' }], 'steer')
    const next = f.commit('user', [{ type: 'text', text: 'Next' }], 'next')
    const batch: Message[] =
      boundary === 'foreign-session'
        ? [{ ...message, sessionId: 'another' }]
        : boundary === 'foreign-run'
          ? [{ ...message, runId: 'another' }]
          : boundary === 'assistant'
            ? [{ ...message, role: 'assistant' }]
            : boundary === 'tool-content'
              ? [{ ...message, content: [{ type: 'tool_call', callId: 'call', name: 'write_file', args: {} }] }]
              : boundary === 'duplicate'
                ? [message, message]
                : boundary === 'reordered'
                  ? [next, message]
                  : boundary === 'changed-sequence'
                    ? [{ ...f.original, seq: next.seq + 1 }]
                    : Array.from({ length: DRIVER_STEERING_BATCH_LIMIT + 1 }, (_, index) => ({
                        ...message,
                        id: `steer-${index}`,
                        seq: index + 2,
                      }))
    let reads = 0
    f.input.getSteeringMessages = () => {
      reads++
      return Promise.resolve(batch)
    }
    const read = f.reader()
    await expect(read()).rejects.toThrow()
    expect(await read()).toEqual([])
    expect(reads).toBe(1)
  })
}

test('cancellation fences an ignored-abort source and never polls another physical read', async () => {
  const f = fixture()
  const pending = Promise.withResolvers<readonly Message[]>()
  let signal: AbortSignal | undefined
  let reads = 0
  f.input.getSteeringMessages = (target) => {
    reads++
    signal = target.signal
    return pending.promise
  }
  const read = f.reader()
  const request = read()
  await Promise.resolve()
  f.controller.abort(new Error('User stopped the original Run'))
  await expect(request).rejects.toThrow('User stopped the original Run')
  expect(signal?.aborted).toBe(true)
  pending.resolve([f.commit('user', [{ type: 'text', text: 'Late guide' }], 'late')])
  expect(await read()).toEqual([])
  expect(reads).toBe(1)
})

test('a stopped Pi Run cannot consume steering or start inference', async () => {
  const f = fixture()
  let reads = 0
  f.input.getSteeringMessages = () => {
    reads++
    return Promise.resolve([])
  }
  f.controller.abort(new Error('Stopped'))
  await expect(new PiDriver().run(f.input)).rejects.toThrow('Stopped')
  expect(reads).toBe(0)
  expect(f.requests).toHaveLength(0)
})

test(
  'deadline retires an ignored-abort source without a second physical read',
  async () => {
    const f = fixture()
    const pending = Promise.withResolvers<readonly Message[]>()
    let signal: AbortSignal | undefined
    let reads = 0
    f.input.getSteeringMessages = (target) => {
      reads++
      signal = target.signal
      return pending.promise
    }
    const read = f.reader()
    try {
      await expect(read()).rejects.toThrow('deadline')
      expect(signal?.aborted).toBe(true)
      expect(await read()).toEqual([])
      expect(reads).toBe(1)
    } finally {
      pending.resolve([])
    }
  },
  DRIVER_STEERING_DEADLINE_MS + 2_000,
)
