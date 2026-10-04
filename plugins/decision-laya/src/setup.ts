import { spawn } from 'node:child_process'
import { access, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { decisionCheckpointSchema } from '@hbar/contracts/decision'
import { LAYA_MODEL_REPO, LAYA_MODEL_REVISION, LAYA_RUNTIME_VERSION, layaInstallationSchema } from './config'
import type { LayaInstallation } from './config'
import { stopOwnedProcess } from './process'

const optionsSchema = z.strictObject({
  runtimeDirectory: z.string().min(1).max(4_000),
  python: z.string().min(1).max(4_000).optional(),
  torchPlatform: z.enum(['cpu', 'cu128', 'pypi']).default('cpu'),
  torchWheel: z.string().min(1).max(4_000).optional(),
  checkpoints: z.array(decisionCheckpointSchema).min(1).max(3).default(['multilingual']),
})
export type LayaSetupOptions = z.input<typeof optionsSchema>

const DOWNLOAD_SOURCE = String.raw`
import sys, json, os
from huggingface_hub import snapshot_download
cfg = json.loads(sys.stdin.readline())
for name in cfg["checkpoints"]:
    prefix = "" if name == "english" else name + "/"
    patterns = [prefix + x for x in ["model.safetensors", "rl_agent_config.json", "tokenizer/*", "encoder/*"]]
    patterns += ["README.md", "LICENSE", "LICENSE.txt"]
    directory = os.path.join(cfg["root"], "models", cfg["revision"])
    snapshot_download(repo_id=cfg["repo"], revision=cfg["revision"], allow_patterns=patterns, local_dir=directory)
`

async function command(args: string[], signal: AbortSignal, input?: unknown): Promise<string> {
  signal.throwIfAborted()
  const executable = args[0]
  if (!executable) throw new Error('Missing setup executable')
  const child = spawn(executable, args.slice(1), {
    windowsHide: true,
    stdio: 'pipe',
    env: {
      ...process.env,
      USE_TF: '0',
      HF_HUB_OFFLINE: '0',
      TRANSFORMERS_OFFLINE: '0',
      PIP_DISABLE_PIP_VERSION_CHECK: '1',
    },
  })
  let output = ''
  let stdout = ''
  const collect = (data: Buffer) => {
    output = (output + data.toString('utf8')).slice(-131_072)
  }
  child.stdout.on('data', (data: Buffer) => {
    stdout = (stdout + data.toString('utf8')).slice(-131_072)
    collect(data)
  })
  child.stderr.on('data', collect)
  child.stdin.on('error', () => {})
  child.stdin.end(input === undefined ? undefined : JSON.stringify(input) + '\n')
  let terminating: Promise<void> | undefined
  const abort = () => {
    terminating ??= stopOwnedProcess(child, 5_000)
    terminating.catch(() => {})
  }
  signal.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    abort()
  }, 30 * 60_000)
  try {
    const code = await new Promise<number>((done, reject) => {
      child.once('error', reject)
      child.once('close', (value) => done(value ?? 1))
    })
    await terminating
    signal.throwIfAborted()
    if (timedOut) throw new Error(`Laya setup command exceeded its 30 minute deadline: ${output.slice(-8_000)}`)
    if (code !== 0) throw new Error(`Laya setup command failed (${code}): ${output.slice(-8_000)}`)
    return stdout
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
  }
}

async function installedTorchVersion(python: string, signal: AbortSignal): Promise<string> {
  const value = (
    await command([python, '-I', '-c', 'from importlib.metadata import version; print(version("torch"))'], signal)
  ).trim()
  if (!/^[0-9][a-zA-Z0-9.+_-]*$/.test(value)) throw new Error('Installed PyTorch version is invalid')
  return value
}

/** Downloads public dependencies and weights only during explicit setup, never during inference. */
export async function setupLaya(
  raw: LayaSetupOptions,
  signal: AbortSignal = new AbortController().signal,
): Promise<LayaInstallation> {
  const options = optionsSchema.parse(raw)
  const root = resolve(options.runtimeDirectory)
  await mkdir(root, { recursive: true })
  const lockPath = join(root, 'setup.lock')
  const lock = await open(lockPath, 'wx').catch(() => {
    throw new Error(`Another setup owns ${lockPath}; verify its process before removing a stale lock`)
  })
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() }))
    const base = options.python ? [options.python] : process.platform === 'win32' ? ['py', '-3'] : ['python3']
    const environment = `venv-${LAYA_RUNTIME_VERSION}-${options.torchPlatform}`
    const pythonRelative =
      process.platform === 'win32' ? `${environment}/Scripts/python.exe` : `${environment}/bin/python`
    const python = join(root, pythonRelative)
    console.log(`Preparing managed Laya environment: ${root}`)
    try {
      await access(python)
    } catch {
      await command([...base, '-m', 'venv', join(root, environment)], signal)
    }
    const requirements = join(root, `${environment}.requirements.txt`)
    let hasLock = false
    try {
      await access(requirements)
      hasLock = true
    } catch {
      /* First installation. */
    }
    const torchIndex =
      options.torchPlatform === 'pypi'
        ? []
        : ['--index-url', `https://download.pytorch.org/whl/${options.torchPlatform}`]
    console.log(`Installing locked Laya ${LAYA_RUNTIME_VERSION} dependencies (${options.torchPlatform})`)
    if (hasLock) {
      const extraIndex =
        options.torchPlatform === 'pypi'
          ? []
          : ['--extra-index-url', `https://download.pytorch.org/whl/${options.torchPlatform}`]
      await command(
        [
          python,
          '-m',
          'pip',
          'install',
          '--progress-bar',
          'off',
          '--index-url',
          'https://pypi.org/simple',
          '-r',
          requirements,
          ...extraIndex,
        ],
        signal,
      )
    } else {
      await command([python, '-m', 'pip', 'install', '--index-url', 'https://pypi.org/simple', 'pip==26.2.1'], signal)
      if (options.torchWheel) await access(resolve(options.torchWheel))
      await command(
        [
          python,
          '-m',
          'pip',
          'install',
          '--progress-bar',
          'off',
          options.torchWheel ? resolve(options.torchWheel) : 'torch',
          ...(options.torchWheel ? ['--index-url', 'https://pypi.org/simple'] : torchIndex),
        ],
        signal,
      )
      const torchVersion = await installedTorchVersion(python, signal)
      await command(
        [
          python,
          '-m',
          'pip',
          'install',
          '--progress-bar',
          'off',
          '--index-url',
          'https://pypi.org/simple',
          `laya[serve]==${LAYA_RUNTIME_VERSION}`,
          `torch==${torchVersion}`,
          'transformers==4.57.6',
          'huggingface_hub==0.36.0',
          'fastapi==0.115.12',
          'pydantic==2.11.7',
          'uvicorn==0.34.3',
          'python-multipart==0.0.20',
        ],
        signal,
      )
    }
    const torchVersion = await installedTorchVersion(python, signal)
    const freeze = (await command([python, '-m', 'pip', 'freeze', '--all'], signal)).replace(
      /^torch @ .*$/m,
      `torch==${torchVersion}`,
    )
    await writeFile(requirements, freeze)
    console.log(`Downloading pinned model revision ${LAYA_MODEL_REVISION}: ${options.checkpoints.join(', ')}`)
    await command([python, '-I', '-X', 'utf8', '-c', DOWNLOAD_SOURCE], signal, {
      root,
      repo: LAYA_MODEL_REPO,
      revision: LAYA_MODEL_REVISION,
      checkpoints: options.checkpoints,
    })
    let previous: LayaInstallation | undefined
    try {
      previous = layaInstallationSchema.parse(JSON.parse(await readFile(join(root, 'installation.json'), 'utf8')))
    } catch {
      /* New installation or a failed earlier setup. */
    }
    const models = { ...previous?.models }
    for (const name of options.checkpoints) {
      const subfolder = name === 'english' ? '' : `/${name}`
      models[name] = {
        directory: `models/${LAYA_MODEL_REVISION}${subfolder}`,
        repo: LAYA_MODEL_REPO,
        revision: LAYA_MODEL_REVISION,
      }
    }
    const installation = layaInstallationSchema.parse({
      version: 1,
      runtimeVersion: LAYA_RUNTIME_VERSION,
      python: pythonRelative,
      models,
    })
    const temporary = join(root, `installation-${randomUUID()}.json`)
    await writeFile(temporary, JSON.stringify(installation, null, 2) + '\n')
    await rename(temporary, join(root, 'installation.json'))
    console.log('Laya setup complete; runtimeDirectory: ' + root)
    return installation
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}
