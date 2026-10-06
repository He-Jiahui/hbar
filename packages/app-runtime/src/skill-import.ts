import { createStore } from 'zustand/vanilla'
import type {
  SkillImportJob,
  SkillImportPreview,
  SkillImportRequest,
  SkillImportStart,
} from '@hbar/contracts/commands/skill-import'
export interface SkillImportPort {
  preview(input: SkillImportRequest, signal: AbortSignal): Promise<SkillImportPreview>
  start(input: SkillImportStart, signal: AbortSignal): Promise<SkillImportJob>
  get(operationId: string, signal: AbortSignal): Promise<SkillImportJob | null>
  latest(signal: AbortSignal): Promise<SkillImportJob | null>
  cancel(operationId: string, signal: AbortSignal): Promise<SkillImportJob | null>
}
export interface SkillImportState {
  readonly source: SkillImportRequest['source']
  readonly sourceRoot: string
  readonly preview: SkillImportPreview | null
  readonly job: SkillImportJob | null
  readonly status: 'idle' | 'previewing' | 'starting' | 'unknown' | 'running' | 'settled'
  readonly error: string | null
  readonly checking: boolean
  readonly page: number
}
function code(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'UNKNOWN_RESULT'
}
export function createSkillImportController(port: SkillImportPort) {
  const store = createStore<SkillImportState>(() => ({
    source: 'claude',
    sourceRoot: '',
    preview: null,
    job: null,
    status: 'idle',
    error: null,
    checking: false,
    page: 0,
  }))
  const lifetime = new AbortController()
  let previewing = false
  let previewGeneration = 0
  let starting = false
  let checking = false
  let cancelling = false
  let pending: SkillImportStart | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let polls = 0
  let leases = 0
  let leaseEpoch = 0
  let mounted = 0
  let jobGeneration = 0
  const stopPolling = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const update = (job: SkillImportJob | null) => {
    if (lifetime.signal.aborted) return
    if (job && pending && job.operationId !== pending.operationId) return
    if (!job) return
    pending = null
    const wasExecuting = ['starting', 'running', 'unknown'].includes(store.getState().status)
    store.setState({
      job,
      status: job.status === 'running' ? 'running' : 'settled',
      error: job.error,
      ...(wasExecuting && job.status !== 'running' ? { preview: null } : {}),
    })
    if (job.status === 'running') schedule()
    else stopPolling()
  }
  const checkResult = async (resetPolls = true) => {
    if (checking || lifetime.signal.aborted) return
    checking = true
    if (resetPolls) polls = 0
    const generation = jobGeneration
    store.setState({ checking: true })
    try {
      const id = pending?.operationId ?? store.getState().job?.operationId
      const job = id ? await port.get(id, lifetime.signal) : await port.latest(lifetime.signal)
      if (generation !== jobGeneration) return
      update(job)
      if (!lifetime.signal.aborted && !store.getState().job && pending) store.setState({ status: 'unknown' })
    } catch (error) {
      if (!lifetime.signal.aborted) store.setState({ error: code(error) })
    } finally {
      checking = false
      if (!lifetime.signal.aborted) store.setState({ checking: false })
    }
  }
  const schedule = () => {
    stopPolling()
    if (!mounted || lifetime.signal.aborted) return
    if (polls >= 300) {
      store.setState({ error: 'SKILL_IMPORT_CHECK_PAUSED' })
      return
    }
    timer = setTimeout(() => {
      polls++
      void checkResult(false)
    }, 1_000)
  }
  const executeStart = async (input: SkillImportStart) => {
    if (starting || lifetime.signal.aborted) return
    starting = true
    jobGeneration++
    pending = input
    store.setState({ status: 'starting', error: null })
    try {
      update(await port.start(input, lifetime.signal))
    } catch (error) {
      if (lifetime.signal.aborted) return
      const reason = code(error)
      const known =
        reason.startsWith('SKILL_') ||
        reason === 'IDEMPOTENCY_CONFLICT' ||
        reason === 'CAPABILITY_UNAVAILABLE' ||
        reason === 'FORBIDDEN' ||
        reason === 'INVALID_INPUT'
      if (known) pending = null
      store.setState({ status: known ? 'idle' : 'unknown', error: reason })
    } finally {
      starting = false
    }
  }
  const edit = (patch: Partial<Pick<SkillImportState, 'source' | 'sourceRoot'>>) => {
    const status = store.getState().status
    if (status === 'running' || status === 'starting' || status === 'unknown' || lifetime.signal.aborted) return
    previewGeneration++
    store.setState({ ...patch, preview: null, status: 'idle', error: null, page: 0 })
  }
  return {
    store,
    acquire() {
      leases++
      leaseEpoch++
      return () => {
        const epoch = ++leaseEpoch
        leases--
        queueMicrotask(() => {
          if (!leases && epoch === leaseEpoch) {
            lifetime.abort()
            stopPolling()
          }
        })
      }
    },
    mount() {
      mounted++
      polls = 0
      void checkResult()
      return () => {
        mounted--
        if (!mounted) stopPolling()
      }
    },
    setSource(source: SkillImportRequest['source']) {
      edit({ source })
    },
    setSourceRoot(sourceRoot: string) {
      edit({ sourceRoot })
    },
    setPage(page: number) {
      const count = store.getState().preview?.candidates.length ?? 0
      store.setState({ page: Math.max(0, Math.min(Math.ceil(count / 20) - 1, page)) })
    },
    async preview() {
      if (previewing || starting || lifetime.signal.aborted || ['running', 'unknown'].includes(store.getState().status))
        return
      previewing = true
      const generation = ++previewGeneration
      const state = store.getState()
      store.setState({ status: 'previewing', error: null })
      try {
        const preview = await port.preview(
          { source: state.source, ...(state.sourceRoot.trim() ? { sourceRoot: state.sourceRoot.trim() } : {}) },
          lifetime.signal,
        )
        if (!lifetime.signal.aborted && generation === previewGeneration)
          store.setState({ preview, status: 'idle', error: null, page: 0 })
      } catch (error) {
        if (!lifetime.signal.aborted && generation === previewGeneration)
          store.setState({ status: 'idle', error: code(error) })
      } finally {
        previewing = false
      }
    },
    async start() {
      const state = store.getState()
      if (
        !state.preview ||
        !state.preview.candidates.some((item) => item.status === 'ready') ||
        pending ||
        state.status === 'running'
      )
        return
      polls = 0
      await executeStart({
        request: state.preview.request,
        expectedRevision: state.preview.revision,
        operationId: crypto.randomUUID(),
      })
    },
    checkResult,
    async retryOriginal() {
      if (pending && store.getState().status === 'unknown') await executeStart(pending)
    },
    async cancel() {
      const operationId = pending?.operationId ?? store.getState().job?.operationId
      if (!operationId || cancelling || lifetime.signal.aborted) return
      cancelling = true
      try {
        const job = await port.cancel(operationId, lifetime.signal)
        if (!job && pending && !lifetime.signal.aborted) {
          pending = null
          store.setState({ status: 'idle', error: 'SKILL_IMPORT_CANCELLED_BEFORE_START' })
        } else update(job)
      } catch (error) {
        if (!lifetime.signal.aborted) store.setState({ error: code(error) })
      } finally {
        cancelling = false
      }
    },
    dispose() {
      lifetime.abort()
      stopPolling()
    },
  }
}
export type SkillImportController = ReturnType<typeof createSkillImportController>
