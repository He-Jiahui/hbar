import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { DecisionCheckpoint, ParsedDecisionRequest } from '@hbar/contracts/decision'
import { DecisionBackendError } from './backend'
import type { DecisionBackend } from './backend'
import { LAYA_RUNTIME_VERSION, layaInstallationSchema } from './config'
import type { LayaConfig, LayaInstallation } from './config'
import { wireQuestions } from './answers'
import { LAYA_PYTHON_SOURCE } from './python-source'
import { stopOwnedProcess } from './process'

const readySchema = z.object({ port: z.number().int().min(1).max(65535), instanceId: z.string() })
const healthSchema = z.object({
  status: z.literal('ok'),
  instanceId: z.string(),
  runtimeVersion: z.literal(LAYA_RUNTIME_VERSION),
  loaded: z.array(z.string()),
})

export type LayaProcessLauncher = (
  command: string,
  args: string[],
  options: { cwd: string; windowsHide: true; stdio: 'pipe'; env: NodeJS.ProcessEnv },
) => ChildProcessWithoutNullStreams

function contained(root: string, path: string): string {
  const target = resolve(root, path)
  const rel = relative(root, target)
  if (isAbsolute(path) || rel.startsWith('..') || isAbsolute(rel))
    throw new DecisionBackendError(
      'NOT_CONFIGURED',
      'Runtime installation paths must stay inside the runtime directory',
    )
  return target
}

async function readResponse(response: Response): Promise<unknown> {
  if (!response.body) throw new DecisionBackendError('INVALID_RESPONSE', 'Laya returned an empty response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 131_072) {
        await reader.cancel()
        throw new DecisionBackendError('INVALID_RESPONSE', 'Laya response exceeded the size limit')
      }
      chunks.push(part.value)
    }
  } finally {
    reader.releaseLock()
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new DecisionBackendError('INVALID_RESPONSE', 'Laya returned malformed JSON')
  }
}

export class ManagedLayaBackend implements DecisionBackend {
  private child: ChildProcessWithoutNullStreams | undefined
  private exited: Promise<void> | undefined
  private starting: Promise<void> | undefined
  private installation: LayaInstallation | undefined
  private endpoint: string | undefined
  private token = ''
  private disposed = false
  constructor(
    private readonly config: LayaConfig,
    private readonly launch: LayaProcessLauncher = spawn,
  ) {}

  revision(checkpoint: DecisionCheckpoint): string | null {
    return this.installation?.models[checkpoint]?.revision ?? null
  }

  async ready(signal: AbortSignal): Promise<void> {
    if (this.disposed) throw new DecisionBackendError('DISPOSED', 'Laya plugin is stopped')
    if (this.child?.exitCode !== null && this.child) await this.stop()
    if (!this.starting) this.starting = this.start(signal)
    try {
      await this.starting
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  private async start(signal: AbortSignal): Promise<void> {
    if (!this.config.runtimeDirectory)
      throw new DecisionBackendError(
        'NOT_CONFIGURED',
        'Run Laya setup and configure runtimeDirectory before evaluation',
      )
    const root = resolve(this.config.runtimeDirectory)
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(join(root, 'installation.json'), 'utf8')) as unknown
    } catch {
      throw new DecisionBackendError('MISSING_DEPENDENCY', 'Laya installation lock is missing; run the setup command')
    }
    const parsed = layaInstallationSchema.safeParse(raw)
    if (!parsed.success)
      throw new DecisionBackendError('MISSING_DEPENDENCY', 'Laya installation lock is incompatible with this plugin')
    this.installation = parsed.data
    const python = contained(root, parsed.data.python)
    try {
      await access(python)
    } catch {
      throw new DecisionBackendError('MISSING_DEPENDENCY', 'The managed Python environment is missing')
    }
    const models: Partial<Record<DecisionCheckpoint, string>> = {}
    for (const name of this.config.checkpoints) {
      const installed = parsed.data.models[name]
      if (!installed) throw new DecisionBackendError('MISSING_MODEL', `Checkpoint ${name} is not installed`)
      const directory = contained(root, installed.directory)
      try {
        await access(join(directory, 'model.safetensors'))
        await access(join(directory, 'rl_agent_config.json'))
      } catch {
        throw new DecisionBackendError('MISSING_MODEL', `Checkpoint ${name} is incomplete; run setup again`)
      }
      models[name] = directory
    }
    signal.throwIfAborted()
    const instanceId = randomUUID()
    this.token = randomUUID() + randomUUID()
    const child = this.launch(python, ['-I', '-X', 'utf8', '-u', '-c', LAYA_PYTHON_SOURCE], {
      cwd: root,
      windowsHide: true,
      stdio: 'pipe',
      env: { ...process.env, USE_TF: '0', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' },
    })
    this.child = child
    this.exited = new Promise((done) => {
      child.once('exit', () => done())
      child.once('error', () => done())
    })
    child.stderr.on('data', () => {
      /* Drain diagnostics; never copy request data or tokens into session events. */
    })
    child.stdin.on('error', () => {})
    const endpoint = await new Promise<string>((accept, reject) => {
      let buffered = ''
      const cleanup = () => {
        child.stdout.removeListener('data', data)
        child.removeListener('error', failed)
        child.removeListener('exit', failed)
        signal.removeEventListener('abort', aborted)
      }
      const failed = () => {
        cleanup()
        reject(
          new DecisionBackendError(
            'PROCESS_EXIT',
            'Laya process exited before becoming ready; check its Python dependencies',
          ),
        )
      }
      const aborted = () => {
        cleanup()
        reject(signal.reason ?? new DecisionBackendError('STARTUP_TIMEOUT', 'Laya startup timed out'))
      }
      const data = (chunk: Buffer) => {
        buffered += chunk.toString('utf8')
        if (buffered.length > 16_384) buffered = buffered.slice(-16_384)
        for (;;) {
          const newline = buffered.indexOf('\n')
          if (newline < 0) break
          const line = buffered.slice(0, newline).trim()
          buffered = buffered.slice(newline + 1)
          if (line.startsWith('hbar-laya-error ')) {
            try {
              const failure = z
                .object({ code: z.enum(['MISSING_DEPENDENCY', 'MISSING_MODEL']) })
                .safeParse(JSON.parse(line.slice(16)) as unknown)
              cleanup()
              reject(
                new DecisionBackendError(
                  failure.success ? failure.data.code : 'PROCESS_EXIT',
                  'Laya startup failed; repair the managed installation',
                ),
              )
            } catch {
              failed()
            }
            return
          }
          if (!line.startsWith('hbar-laya-ready ')) continue
          try {
            const value = readySchema.parse(JSON.parse(line.slice(16)))
            if (value.instanceId !== instanceId) {
              failed()
              return
            }
            cleanup()
            accept(`http://127.0.0.1:${value.port}`)
            return
          } catch {
            failed()
            return
          }
        }
      }
      child.stdout.on('data', data)
      child.once('error', failed)
      child.once('exit', failed)
      signal.addEventListener('abort', aborted, { once: true })
      if (signal.aborted) aborted()
      child.stdin.end(
        JSON.stringify({
          runtimeVersion: LAYA_RUNTIME_VERSION,
          models,
          device: this.config.device,
          token: this.token,
          instanceId,
        }) + '\n',
      )
    })
    child.stdout.on('data', () => {})
    while (!signal.aborted) {
      if (child.exitCode !== null) throw new DecisionBackendError('PROCESS_EXIT', 'Laya process exited during startup')
      try {
        const response = await fetch(`${endpoint}/health`, {
          headers: { Authorization: `Bearer ${this.token}` },
          signal,
          redirect: 'error',
        })
        const health = healthSchema.safeParse(await readResponse(response))
        if (
          response.ok &&
          health.success &&
          health.data.instanceId === instanceId &&
          this.config.checkpoints.every((name) => health.data.loaded.includes(name))
        ) {
          this.endpoint = endpoint
          return
        }
      } catch {
        if (signal.aborted) signal.throwIfAborted()
      }
      await new Promise<void>((done) => setTimeout(done, 50))
    }
    signal.throwIfAborted()
  }

  async predict(request: ParsedDecisionRequest, signal: AbortSignal): Promise<unknown> {
    if (!this.endpoint || !this.child || this.child.exitCode !== null)
      throw new DecisionBackendError('PROCESS_EXIT', 'Laya process is unavailable')
    if (!this.config.checkpoints.includes(request.checkpoint))
      throw new DecisionBackendError('MISSING_MODEL', `Checkpoint ${request.checkpoint} is not enabled`)
    let response: Response
    try {
      response = await fetch(`${this.endpoint}/v1/systemone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ state: request.state, questions: wireQuestions(request), model: request.checkpoint }),
        signal,
        redirect: 'error',
      })
    } catch {
      if (signal.aborted) throw signal.reason
      throw new DecisionBackendError('PROCESS_EXIT', 'The local Laya connection was lost')
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new DecisionBackendError('INFERENCE_FAILED', `Laya inference failed with HTTP ${response.status}`)
    }
    return readResponse(response)
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = undefined
    this.starting = undefined
    this.endpoint = undefined
    this.token = ''
    if (!child || child.exitCode !== null) return
    try {
      await stopOwnedProcess(child, this.config.shutdownTimeoutMs)
    } catch (error) {
      this.disposed = true
      this.child = child
      throw error
    }
    await this.exited
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await this.stop()
  }
}
