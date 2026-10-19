import { afterEach, expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError, providerSchema, type Message, type SessionEvent } from '@hbar/contracts'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import type { DriverInput } from '@hbar/plugin-sdk'
import { ManagedProcess, RuntimeArtifactStore } from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { RuntimeDriverAdapter } from '../apps/host/src/runtime-driver-adapter'
import { DRIVER_RUNTIME_FINGERPRINT } from '../apps/host/src/runtime-driver-process'
import { classifyRunFailure } from '../packages/kernel/src/run-failure'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const owned: Array<{ root: string; managed: ManagedProcess; adapter: () => RuntimeDriverAdapter | undefined }> = []
afterEach(async () => {
  for (const resource of owned.splice(0)) {
    await resource.managed.dispose()
    resource.adapter()?.dispose()
    await removeOwnedTestDirectory(resource.root, 'hbar-driver-provider-failure-')
  }
})

test('real isolated Pi preserves transient, quota and permanent policy over the original code-only terminal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-driver-provider-failure-'))
  const descriptor: RuntimeUnitDescriptor = {
    id: 'driver.pi',
    kind: 'driver',
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: DRIVER_RUNTIME_FINGERPRINT,
    storageSchema: STORAGE_SCHEMA_VERSION,
  }
  const store = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
  const artifact = await store.build({ descriptor, entrypoint: 'apps/host/src/runtime-driver-process.ts' })
  let adapter!: RuntimeDriverAdapter
  const managed = new ManagedProcess({
    descriptor,
    artifactId: artifact.id,
    modulePath: await store.modulePath(artifact.id),
    generation: 1,
    parent: { unitId: 'kernel', generation: 1, incarnation: 'original-kernel' },
    onPeer: (peer) => {
      adapter = new RuntimeDriverAdapter(peer)
    },
    onExit: async () => {
      adapter?.dispose()
    },
  })
  owned.push({ root, managed, adapter: () => adapter })
  await managed.prepare()
  await managed.activate()
  if (!adapter) throw new Error('Original Driver adapter was not attached')
  const cases = [
    {
      status: 503,
      message: '503 temporarily unavailable',
      code: 'PROVIDER_TRANSIENT',
      category: 'transient',
      retryable: true,
    },
    {
      status: 429,
      message: '429 too many requests',
      code: 'PROVIDER_TRANSIENT',
      category: 'transient',
      retryable: true,
    },
    {
      status: 429,
      message: '429 insufficient quota',
      code: 'PROVIDER_USAGE_LIMIT',
      category: 'usage_limit',
      retryable: false,
    },
    {
      status: 401,
      message: '401 invalid API key',
      code: 'DRIVER_EXECUTION_FAILED',
      category: 'execution',
      retryable: false,
    },
  ] as const
  let selected: (typeof cases)[number] = cases[0]
  const requests: string[] = []
  const endpoint = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      requests.push(request.method + ' ' + new URL(request.url).pathname)
      return Response.json(
        { error: { message: selected.message, type: 'owned_fixture', code: 'owned_fixture' } },
        { status: selected.status },
      )
    },
  })
  const now = Date.now()
  const session = {
    id: 'session',
    workspaceId: 'workspace',
    title: 'Failure policy',
    archived: false,
    parentId: null,
    createdAt: now,
    updatedAt: now,
    seq: 0,
  }
  try {
    for (const [index, scenario] of cases.entries()) {
      selected = scenario
      const model = providerSchema.parse({
        id: 'owned-provider',
        name: 'Owned provider',
        protocol: 'openai-completions',
        baseUrl: 'http://127.0.0.1:' + endpoint.port + '/v1',
        model: 'owned-model',
      })
      const runId = 'run-' + index
      const messages: Message[] = [
        {
          id: 'input-' + index,
          sessionId: session.id,
          runId,
          role: 'user',
          content: [{ type: 'text', text: 'Owned request once' }],
          seq: 1,
          createdAt: now,
        },
      ]
      let sequence = 0
      const input: DriverInput = {
        session,
        workspace: { id: 'workspace', path: root, name: 'Owned', createdAt: now },
        run: {
          id: runId,
          sessionId: session.id,
          requestId: 'request-' + index,
          input: { text: 'Owned request once', images: [] },
          modelId: model.id,
          status: 'running',
          createdAt: now,
          startedAt: now,
          endedAt: null,
          error: null,
        },
        request: { system: 'Owned local failure fixture', model, messages },
        tools: [],
        apiKey: 'owned-fixture-key',
        signal: new AbortController().signal,
        resolveKey: async () => 'owned-fixture-key',
        readImage: async () => ({ mime: 'image/png', data: '' }),
        readFile: async () => ({ name: 'unused', mime: 'text/plain', size: 0, text: '', truncated: false }),
        async emit(type, data, stepId): Promise<SessionEvent> {
          return {
            eventId: crypto.randomUUID(),
            sessionId: session.id,
            seq: ++sequence,
            runId,
            stepId: stepId ?? null,
            type,
            data,
            time: Date.now(),
            version: 1,
          }
        },
        async commit(role, content, id, providerData): Promise<Message> {
          const message: Message = {
            id: id ?? crypto.randomUUID(),
            sessionId: session.id,
            runId,
            role,
            content,
            seq: messages.length + 1,
            createdAt: now,
            ...(providerData === undefined ? {} : { providerData }),
          }
          messages.push(message)
          return message
        },
        stream: () => {},
        execute: async () => {
          throw new Error('No tool effects in provider fixture')
        },
        beforeRequest: async (request) => ({ ...request, messages: [...messages] }),
        stepEnded: async () => {},
      }
      const error: unknown = await adapter.run(input).then(
        () => undefined,
        (failure: unknown) => failure,
      )
      expect(error).toBeInstanceOf(HbarError)
      expect(error).toMatchObject({ code: scenario.code, message: 'Driver execution stopped' })
      expect(classifyRunFailure(error)).toEqual({
        code: scenario.code,
        category: scenario.category,
        retryable: scenario.retryable,
      })
      expect(requests).toHaveLength(index + 1)
      expect(managed.snapshot().phase).toBe('serving')
      expect(managed.snapshot().references.requests).toBe(0)
    }
    expect(requests).toEqual(cases.map(() => 'POST /v1/chat/completions'))
  } finally {
    await endpoint.stop(true)
  }
}, 20_000)
