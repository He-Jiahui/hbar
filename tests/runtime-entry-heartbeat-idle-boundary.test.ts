import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { IpcPeer, runtimeDrainSchema, runtimeIdleProbeSchema, runtimeReadySchema, type IpcFrame } from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'

for (const mode of ['control', 'idle-retirement'] as const) {
  test(
    mode === 'control'
      ? 'actual entry heartbeat waiting for its exact transport ACK remains visible in the final idle probe'
      : 'marked idle-retirement drain waits for the exact heartbeat ACK and freezes only its new heartbeat scheduling',
    async () => {
      const parent = { unitId: 'base', generation: 1, incarnation: 'heartbeat-idle-parent' }
      const owner = { unitId: 'heartbeat-idle', generation: 1, incarnation: 'heartbeat-idle-child' }
      let peer: IpcPeer | undefined
      let heartbeatId: string | undefined
      let heartbeatBytes = 0
      let heldAck: IpcFrame | undefined
      let heartbeatCount = 0
      let markedDrain: Promise<unknown> | undefined
      const readHeldAck = (): IpcFrame | undefined => heldAck
      let entered: () => void = () => {
        throw new Error('Heartbeat entry gate was not initialized')
      }
      const heartbeat = new Promise<void>((resolve) => {
        entered = resolve
      })
      const fragmentSchema = z.object({
        kind: z.literal('fragment'),
        id: z.string(),
        total: z.literal(1),
        index: z.literal(0),
        data: z.string(),
      })
      const heartbeatSchema = z.object({
        message: z.object({
          kind: z.literal('event'),
          method: z.literal('runtime.heartbeat'),
          input: z.strictObject({ time: z.number().int().nonnegative() }),
        }),
      })
      const descriptor = {
        id: owner.unitId,
        kind: 'plugin',
        isolation: 'process',
        dependencies: [],
        required: true,
        reloadable: true,
        contractFingerprint: 'a'.repeat(64),
        storageSchema: STORAGE_SCHEMA_VERSION,
      }
      const child = Bun.spawn([process.execPath, fileURLToPath(import.meta.resolve('@hbar/runtime/entry'))], {
        env: {
          ...process.env,
          HBAR_RUNTIME_SELF: JSON.stringify(owner),
          HBAR_RUNTIME_PARENT: JSON.stringify(parent),
          HBAR_RUNTIME_MODULE: fileURLToPath(new URL('./fixtures/runtime-idle-service.ts', import.meta.url)),
          HBAR_RUNTIME_HEARTBEAT_MS: '1000',
        },
        ipc(message: unknown) {
          const fragment = fragmentSchema.safeParse(message)
          if (!heartbeatId && fragment.success) {
            try {
              const decoded: unknown = JSON.parse(fragment.data.data)
              if (heartbeatSchema.safeParse(decoded).success) {
                heartbeatId = fragment.data.id
                heartbeatBytes = new TextEncoder().encode(fragment.data.data).byteLength
              }
            } catch {
              // Only identification is local; the actual peer still validates every original frame.
            }
          }
          peer?.receive(message)
        },
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'pipe',
        windowsHide: true,
      })
      const stderr = new Response(child.stderr).text()
      peer = new IpcPeer({
        owner: parent,
        remote: owner,
        transport: {
          send(frame) {
            if (frame.kind === 'ack' && frame.id === heartbeatId && !heldAck) {
              heldAck = frame
              return
            }
            child.send(frame)
          },
        },
      })
      peer.onEvent('runtime.heartbeat', z.strictObject({ time: z.number().int().nonnegative() }), () => {
        heartbeatCount++
        entered()
      })
      let primary: { readonly error: unknown } | undefined
      try {
        await peer.call('runtime.prepare', { descriptor, configuration: {} }, runtimeReadySchema)
        await peer.call('runtime.activate', { role: 'default' }, z.undefined())
        await heartbeat
        expect(readHeldAck()?.kind).toBe('ack')
        expect(heartbeatBytes).toBe(108)
        if (mode === 'idle-retirement') {
          let settled = false
          markedDrain = peer.call('runtime.drain', { mode: 'idle-retirement' }, runtimeDrainSchema).then(
            (result) => {
              settled = true
              return result
            },
            (error: unknown) => {
              settled = true
              return error
            },
          )
          const pending = await peer.call('runtime.idle', undefined, runtimeIdleProbeSchema)
          expect(pending.eligible).toBe(false)
          expect(settled).toBe(false)
          const ack = readHeldAck()
          if (!ack) throw new Error('Missing exact heartbeat ACK')
          child.send(ack)
          expect(await markedDrain).toEqual({ requests: 0, runs: 0, resources: 0 })
        } else {
          await peer.call('runtime.drain', undefined, runtimeDrainSchema)
          const busy = await peer.call('runtime.idle', undefined, runtimeIdleProbeSchema)
          expect(busy).toMatchObject({
            requests: 0,
            runs: 0,
            resources: 0,
            eligible: false,
            ipc: {
              inFlight: 0,
              waiting: 0,
              queued: 0,
              queuedBytes: 0,
              incoming: 0,
              incomingWaiting: 0,
              incomingQueued: 0,
              bufferedBytes: heartbeatBytes,
              failed: false,
            },
          })
          expect(busy.ipc.incomingBytes).toBeGreaterThan(0)
          const ack = readHeldAck()
          if (!ack) throw new Error('Missing exact heartbeat ACK')
          child.send(ack)
        }
        const clean = await peer.call('runtime.idle', undefined, runtimeIdleProbeSchema)
        expect(clean).toMatchObject({ eligible: true, ipc: { bufferedBytes: 0, incoming: 0, failed: false } })
        const before = heartbeatCount
        await Bun.sleep(1100)
        if (mode === 'idle-retirement') expect(heartbeatCount).toBe(before)
        else expect(heartbeatCount).toBeGreaterThan(before)
      } catch (error: unknown) {
        primary = { error }
      }
      const cleanupErrors: unknown[] = []
      const activePeer = peer
      const cleanup = [
        () => {
          const ack = readHeldAck()
          if (ack && child.exitCode === null) child.send(ack)
        },
        async () => {
          await markedDrain
        },
        async () => {
          if (child.exitCode === null) await activePeer.call('runtime.dispose', undefined, z.undefined())
        },
        async () => {
          if (child.exitCode === null) await activePeer.call('runtime.exit', undefined, z.undefined())
        },
        async () => {
          expect(await child.exited).toBe(0)
        },
        async () => {
          await stderr
        },
      ]
      for (const action of cleanup) {
        try {
          await action()
        } catch (error: unknown) {
          cleanupErrors.push(error)
        }
      }
      activePeer.close()
      if (primary && cleanupErrors.length)
        throw new AggregateError([primary.error, ...cleanupErrors], 'Heartbeat witness and cleanup failed', {
          cause: primary.error,
        })
      if (primary) throw primary.error
      if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Heartbeat witness cleanup failed')
    },
    15_000,
  )
}
