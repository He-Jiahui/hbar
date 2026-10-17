import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { z } from 'zod'
import { IpcPeer, procedure, RuntimeValuePort } from '@hbar/runtime'
import { CommandRegistry } from '@hbar/commands'
import { createPathLayout } from '@hbar/storage'
import { chatDatabaseCommands } from '@hbar/contracts/commands/chat-database'
import { RuntimeControllerAdapter } from '../apps/host/src/runtime-controller-adapter'
import { RuntimeControllerKernel } from '../apps/host/src/runtime-controller-kernel'
import { RuntimeScheduleAlarmTransfer } from '../apps/host/src/runtime-schedule-alarm-transfer'
import { createScheduleStorage } from '../packages/storage/src/schedules'
import { readScheduleIdleCheckpoint } from '../packages/storage/src/schedule-idle-checkpoint'
import {
  projectScheduleIdleManifest,
  scheduleWakeSchema,
  scheduleWakeReplySchema,
} from '../apps/host/src/runtime-schedule-idle-contract'
import {
  controllerScheduleInitializeSchema,
  controllerScheduleStatusSchema,
} from '../apps/host/src/runtime-controller-schedule-contract'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function fixture(
  failInitialize = false,
  lifecycle?: {
    restored?: boolean
    beforeInitialize?: () => Promise<void>
    beforeResume?: () => Promise<void>
  },
) {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE workspaces(id TEXT PRIMARY KEY)')
  createScheduleStorage(db)
  db.exec(`CREATE TABLE runs(id TEXT PRIMARY KEY,sessionId TEXT,requestId TEXT,status TEXT);
    CREATE TABLE events(seq INTEGER,runId TEXT,sessionId TEXT,type TEXT,data TEXT);
    CREATE TABLE messages(id TEXT PRIMARY KEY);
    CREATE TABLE session_search_progress(id INTEGER PRIMARY KEY,lastMessageRowid INTEGER NOT NULL);
    INSERT INTO session_search_progress VALUES(1,0);
    CREATE TABLE session_search_queue(messageId TEXT PRIMARY KEY,nextOffset INTEGER,segmentIndex INTEGER)`)
  const snapshot = readScheduleIdleCheckpoint(db, 'd'.repeat(64))
  const manifest = projectScheduleIdleManifest(snapshot, 1000)
  let child!: IpcPeer
  const parent = new IpcPeer({
    owner: { unitId: 'host', generation: 1, incarnation: 'host' },
    remote: { unitId: 'controller', generation: 2, incarnation: 'restored-controller' },
    transport: { send: (frame) => child.receive(structuredClone(frame)) },
  })
  child = new IpcPeer({
    owner: parent.remote,
    remote: parent.owner,
    transport: { send: (frame) => parent.receive(structuredClone(frame)) },
  })
  let adapter: RuntimeControllerAdapter | undefined
  const alarms = new RuntimeScheduleAlarmTransfer(
    'epoch',
    {
      acquire: () => Promise.resolve({ owner: parent.remote, release() {} }),
      catalog: () => ({ revision: 'c'.repeat(64), databaseIds: [snapshot.database.id] }),
      wake: (actualOwner, exactAck) => {
        expect(actualOwner).toEqual(parent.remote)
        if (!adapter) throw new Error('Adapter not initialized')
        return adapter.wakeSchedule(exactAck)
      },
      physicalExit: () => Promise.resolve('unknown'),
    },
    { now: () => 1000, schedule: () => ({ cancel() {} }) },
  )
  const oldOwner = { ...parent.remote, generation: 1, incarnation: 'original-controller' }
  const ack = alarms.offer(oldOwner, manifest)
  alarms.commit(oldOwner, ack, manifest)
  alarms.activate(oldOwner, ack)
  // Use the real typed Kernel projection and command registry instead of casting a fake Kernel/Native result.
  // No application callback should be invoked by these lifecycle-only public adapter methods.
  const kernelValues = new RuntimeValuePort(child, { prefix: 'test.kernel' })
  const kernel = new RuntimeControllerKernel(
    kernelValues,
    createPathLayout(
      'D:/hbar-restored-resume-test/data',
      'D:/hbar-restored-resume-test/cache',
      'D:/hbar-restored-resume-test/paths.json',
    ),
    false,
    'restored-resume-test',
  )
  const registry = new CommandRegistry({ execution: 'host' })
  for (const definition of Object.values(chatDatabaseCommands))
    registry.register<z.ZodType, z.ZodType>(definition, () => {
      throw new Error('Unexpected maintenance dispatch')
    })
  const localAdapter = new RuntimeControllerAdapter(parent, {
    kernel: kernel.api,
    ...(lifecycle?.restored === false ? {} : { scheduleIdleRestore: ack }),
    maintenance: {
      dispatch: (value, actorId) => registry.dispatch(value, { actorId }),
      describe: (id) => registry.describe(id),
      list: () => registry.list(),
      dispose: () => registry.dispose(),
    },
    projection: () => {
      throw new Error('Unexpected Kernel projection callback')
    },
    background: () => true,
    admitsApplications: () => true,
    fresh: () => {
      throw new Error('Unexpected notification')
    },
  })
  adapter = localAdapter
  const state = { initializations: 0, wakes: 0, resumes: 0, pauses: 0, background: false }
  child.register(
    'controller.schedule.initialize',
    procedure(controllerScheduleInitializeSchema, controllerScheduleStatusSchema, async (input) => {
      state.initializations++
      expect(input).toEqual(lifecycle?.restored === false ? { mode: 'normal' } : { mode: 'idle-wake', ack })
      await lifecycle?.beforeInitialize?.()
      if (failInitialize) throw new Error('Initialization reply unavailable')
      return controllerScheduleStatusSchema.parse({ phase: input.mode === 'normal' ? 'open' : 'restored' })
    }),
  )
  child.register(
    'controller.schedule.wake',
    procedure(scheduleWakeSchema, scheduleWakeReplySchema, (input) => {
      expect(input.ack).toEqual(ack)
      state.wakes++
      state.background = true
      return { kind: 'settled', manifest }
    }),
  )
  child.register(
    'controller.pause',
    procedure(z.undefined(), z.undefined(), () => {
      state.pauses++
      state.background = false
    }),
  )
  child.register(
    'controller.resume',
    procedure(z.undefined(), z.undefined(), async () => {
      state.resumes++
      await lifecycle?.beforeResume?.()
      state.background = true
    }),
  )
  return {
    adapter: localAdapter,
    alarms,
    owner: parent.remote,
    state,
    ack,
    close() {
      alarms.stop()
      localAdapter.dispose()
      kernelValues.dispose()
      registry.dispose()
      parent.close()
      child.close()
      db.close()
    },
  }
}

test('actual clean-restored adapter initializes once, wakes, pauses and resumes its same owner background', async () => {
  const f = fixture()
  try {
    await f.adapter.resume()
    expect(f.state).toEqual({ initializations: 1, wakes: 0, resumes: 0, pauses: 0, background: false })
    expect(f.adapter.scheduleIdleSnapshot()).toEqual({ initialized: true, fenced: true })
    await f.alarms.wakeForeground(f.owner, f.ack)
    expect(f.state).toEqual({ initializations: 1, wakes: 1, resumes: 0, pauses: 0, background: true })
    expect(f.adapter.scheduleIdleSnapshot()).toEqual({ initialized: true, fenced: false })
    f.alarms.pause()
    await f.adapter.pause()
    expect(f.state.background).toBe(false)
    f.alarms.resume()
    await f.alarms.wakeForeground(f.owner, f.ack)
    expect(f.state).toEqual({ initializations: 1, wakes: 1, resumes: 0, pauses: 1, background: false })
    // The actual parent's delivered confirmation does not issue a second wake after reversible pause.
    // Actual same-owner background restoration must therefore pass through controller.resume here.
    await f.adapter.resume()
    expect(f.state).toEqual({ initializations: 1, wakes: 1, resumes: 1, pauses: 1, background: true })
    expect(f.adapter.scheduleIdleSnapshot()).toEqual({ initialized: true, fenced: false })
  } finally {
    f.close()
  }
})

test('failed restored initialization memo remains fenced and is never retried or replaced by ordinary resume', async () => {
  const f = fixture(true)
  try {
    const outcomes = await Promise.allSettled([f.adapter.resume(), f.adapter.wakeSchedule(f.ack)])
    expect(outcomes.map((value) => value.status)).toEqual(['rejected', 'rejected'])
    expect(f.adapter.scheduleIdleSnapshot()).toEqual({ initialized: false, fenced: true })
    await expect(f.adapter.resume()).rejects.toThrow()
    await expect(f.adapter.resume(() => false)).rejects.toThrow()
    await expect(f.adapter.wakeSchedule(f.ack)).rejects.toThrow()
    expect(f.state).toEqual({ initializations: 1, wakes: 0, resumes: 0, pauses: 0, background: false })
  } finally {
    f.close()
  }
})

test('actual adapter checks the current resume guard after delayed initialization before sending ordinary resume', async () => {
  const entered = deferred()
  const release = deferred()
  let admitted = true
  const f = fixture(false, {
    restored: false,
    beforeInitialize: () => {
      entered.resolve()
      return release.promise
    },
  })
  const accepted = f.adapter.resume(() => admitted)
  void accepted.catch(() => undefined)
  try {
    await entered.promise
    admitted = false
    f.alarms.pause()
    await f.adapter.pause()
    release.resolve()
    await accepted
    expect(f.state).toEqual({ initializations: 1, wakes: 0, resumes: 0, pauses: 1, background: false })
    expect(f.adapter.scheduleIdleSnapshot()).toEqual({ initialized: true, fenced: false })
    f.alarms.resume()
    admitted = true
    await f.adapter.resume(() => admitted)
    expect(f.state).toEqual({ initializations: 1, wakes: 0, resumes: 1, pauses: 1, background: true })
  } finally {
    release.resolve()
    await accepted.catch(() => undefined)
    f.close()
  }
})

test('a dispatched ordinary resume keeps its actual IPC completion before the caller performs final pause', async () => {
  const entered = deferred()
  const release = deferred()
  let admitted = true
  let settled = false
  const f = fixture(false, {
    restored: false,
    beforeResume: () => {
      entered.resolve()
      return release.promise
    },
  })
  const accepted = f.adapter.resume(() => admitted)
  const tracked = accepted.then(() => {
    settled = true
  })
  void tracked.catch(() => undefined)
  try {
    await entered.promise
    admitted = false
    f.alarms.pause()
    expect(settled).toBe(false)
    expect(f.state.resumes).toBe(1)
    release.resolve()
    await tracked
    expect(f.state.background).toBe(true)
    await f.adapter.pause()
    expect(f.state).toEqual({ initializations: 1, wakes: 0, resumes: 1, pauses: 1, background: false })
  } finally {
    release.resolve()
    await tracked.catch(() => undefined)
    f.close()
  }
})
