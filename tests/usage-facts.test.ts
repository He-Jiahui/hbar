import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { emptyUsage, providerSchema } from '@hbar/contracts'
import { usageAttemptDescriptorSchema, usageAttemptMarkerSchema, usageRecordedDataSchema } from '@hbar/contracts/usage'
import { createUsageFact } from '@hbar/usage'

function parseDescriptor(data: unknown) {
  const value = data as Record<string, unknown>
  return usageAttemptDescriptorSchema.parse({
    attemptId: value.attemptId,
    source: value.source,
    providerId: value.providerId,
    modelId: value.modelId,
    modelSelectionId: value.modelSelectionId,
    pricing: value.pricing,
  })
}

test('model attempts persist stable timing markers and versioned usage facts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-usage-facts-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  try {
    const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
    const run = await kernel.submit(
      session.id,
      'usage-facts',
      { text: 'measure this request', images: [] },
      'local-fixture',
    )
    await kernel.waitForIdle()
    const events = await kernel.storage.call('events', session.id, 0)
    const request = events.find((event) => event.type === 'request.started')!
    const provider = events.find((event) => event.type === 'attempt.providerStarted')!
    const firstText = events.find((event) => event.type === 'attempt.firstText')!
    const usage = events.find((event) => event.type === 'usage.recorded')!
    const descriptor = parseDescriptor(request.data)
    const providerMarker = usageAttemptMarkerSchema.parse(provider.data)
    const textMarker = usageAttemptMarkerSchema.parse(firstText.data)
    const fact = usageRecordedDataSchema.parse(usage.data)

    expect(descriptor).toMatchObject({
      attemptId: request.stepId,
      source: 'model',
      providerId: 'local-fixture',
      modelId: 'fixture',
      modelSelectionId: 'local-fixture',
      pricing: { available: true, currency: 'USD', source: 'fixture' },
    })
    expect(providerMarker.attemptId).toBe(descriptor.attemptId)
    expect(textMarker.attemptId).toBe(descriptor.attemptId)
    expect(fact).toMatchObject({
      accountingVersion: 1,
      usageId: `${run.id}:${descriptor.attemptId}:model`,
      attemptId: descriptor.attemptId,
      source: 'model',
      cacheEligibleInput: null,
      costEstimated: false,
    })
    expect(fact.input).toBeGreaterThan(0)
    expect(fact.output).toBeGreaterThan(0)
    expect(request.time).toBeLessThanOrEqual(provider.time)
    expect(provider.time).toBeLessThanOrEqual(firstText.time)
    expect(firstText.time).toBeLessThanOrEqual(usage.time)
    expect(events.some((event) => event.type === 'attempt.firstThinking')).toBe(false)
  } finally {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('compaction usage is attributable while unavailable prices remain explicit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-compaction-usage-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  try {
    const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
    for (let index = 0; index < 7; index++) {
      await kernel.submit(session.id, `compaction-${index}`, { text: `Message ${index}`, images: [] }, 'local-fixture')
      await kernel.waitForIdle()
    }
    await kernel.compact(session.id, 'local-fixture')
    const events = await kernel.storage.call('events', session.id, 0)
    const request = events.find((event) => event.type === 'compaction.request')!
    const usage = events
      .filter((event) => event.type === 'usage.recorded')
      .map((event) => ({ event, fact: usageRecordedDataSchema.parse(event.data) }))
      .find(({ fact }) => fact.source === 'compaction')!
    const descriptor = parseDescriptor(request.data)

    expect(descriptor).toMatchObject({ attemptId: request.stepId, source: 'compaction' })
    expect(usage.fact).toMatchObject({
      usageId: `session:${descriptor.attemptId}:compaction`,
      attemptId: descriptor.attemptId,
      source: 'compaction',
    })
    expect(request.time).toBeLessThanOrEqual(usage.event.time)

    const unpriced = providerSchema.parse({
      id: 'unpriced',
      name: 'Unpriced provider',
      protocol: 'openai-responses',
      baseUrl: 'https://example.test',
      model: 'unknown-price',
    })
    expect(
      createUsageFact({
        usage: emptyUsage(),
        attemptId: 'unpriced-attempt',
        source: 'model',
        model: unpriced,
      }),
    ).toMatchObject({ pricing: { available: false }, costEstimated: true })
  } finally {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
