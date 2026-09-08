import { readFile, readdir, realpath, mkdir, writeFile, rename, stat } from 'node:fs/promises'
import { resolve, relative, dirname, isAbsolute, join, basename } from 'node:path'
import { z } from 'zod'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { ExecutionProvider, ToolResult } from '@hbar/plugin-sdk'
import { HbarError } from '@hbar/contracts'

export async function workspacePath(
  workspace: string,
  requested: string,
  writing = false,
  blocked: string[] = [],
): Promise<string> {
  const root = await realpath(workspace)
  const path = resolve(root, requested)
  const inside = (candidate: string) => {
    const rel = relative(root, candidate)
    return rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel)
  }
  if (!inside(path)) throw new HbarError('PATH_DENIED', 'Path is outside the workspace')
  let actual: string
  try {
    actual = await realpath(path)
  } catch (error) {
    if (!writing || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    let parent = dirname(path)
    for (;;) {
      try {
        actual = await realpath(parent)
        break
      } catch (nested) {
        if ((nested as NodeJS.ErrnoException).code !== 'ENOENT' || parent === dirname(parent)) throw nested
        parent = dirname(parent)
      }
    }
  }
  if (!inside(actual!)) throw new HbarError('PATH_DENIED', 'Symlink resolves outside the workspace')
  for (const protectedPath of blocked) {
    const relation = relative(protectedPath, actual!)
    if (!relation || (!relation.startsWith('..') && !isAbsolute(relation)))
      throw new HbarError('PATH_DENIED', 'Host runtime data is protected')
  }
  return path
}

export class LocalExecution implements ExecutionProvider {
  constructor(private blocked: string[] = []) {}
  async list(workspace: string, requested: string) {
    const path = await workspacePath(workspace, requested, false, this.blocked)
    return (await readdir(path, { withFileTypes: true }))
      .slice(0, 1000)
      .map((entry) => ({
        name: entry.name,
        directory: entry.isDirectory(),
        path: relative(workspace, join(path, entry.name)).replaceAll('\\', '/'),
      }))
      .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))
  }
  async read(workspace: string, requested: string) {
    const path = await workspacePath(workspace, requested, false, this.blocked)
    const info = await stat(path)
    if (!info.isFile() || info.size > 2 * 1024 * 1024)
      throw new HbarError('FILE_LIMIT', 'Read requires a file no larger than 2 MiB')
    return readFile(path, 'utf8')
  }
  async write(workspace: string, requested: string, text: string) {
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new HbarError('FILE_LIMIT', 'Write exceeds 2 MiB')
    const path = await workspacePath(workspace, requested, true, this.blocked)
    let before = ''
    try {
      before = await this.read(workspace, requested)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await mkdir(dirname(path), { recursive: true })
    await workspacePath(workspace, requested, true, this.blocked)
    const temporary = join(dirname(path), `.${basename(path)}.hbar-${crypto.randomUUID()}`)
    try {
      await writeFile(temporary, text, { flag: 'wx', mode: 0o600 })
      await workspacePath(workspace, requested, true, this.blocked)
      await rename(temporary, path)
    } finally {
      await Bun.file(temporary)
        .delete()
        .catch((error) => {
          if (error.code !== 'ENOENT') throw error
        })
    }
    return { before, after: text, path: requested }
  }
  async exec(workspace: string, command: string, signal: AbortSignal): Promise<ToolResult> {
    signal.throwIfAborted()
    const env: Record<string, string> = {}
    const allowed = new Set([
      'path',
      'pathext',
      'systemroot',
      'windir',
      'comspec',
      'temp',
      'tmp',
      'home',
      'userprofile',
      'appdata',
      'localappdata',
      'lang',
      'lc_all',
      'term',
    ])
    for (const [key, value] of Object.entries(process.env))
      if (value !== undefined && allowed.has(key.toLowerCase())) env[key] = value
    const argv =
      process.platform === 'win32'
        ? ['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command]
        : ['/bin/sh', '-c', command]
    const child = Bun.spawn(argv, {
      cwd: workspace,
      env,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
      windowsHide: true,
    })
    let terminating: Promise<void> | undefined
    const terminate = () =>
      (terminating ??= (async () => {
        if (process.platform === 'win32') {
          const killer = Bun.spawn(['taskkill.exe', '/PID', String(child.pid), '/T', '/F'], {
            stdout: 'ignore',
            stderr: 'ignore',
            windowsHide: true,
          })
          await killer.exited
        } else {
          child.kill('SIGTERM')
        }
        if (child.exitCode === null) child.kill()
      })())
    const onAbort = () => {
      void terminate().catch(() => child.kill())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    const timeout = setTimeout(onAbort, 120_000)
    let truncated = false
    async function collect(stream: ReadableStream<Uint8Array>) {
      const decoder = new TextDecoder()
      let text = ''
      for await (const bytes of stream) {
        text += decoder.decode(bytes, { stream: true })
        if (text.length > 64_000) {
          text = text.slice(-64_000)
          truncated = true
        }
      }
      return text + decoder.decode()
    }
    try {
      const [stdout, stderr, code] = await Promise.all([collect(child.stdout), collect(child.stderr), child.exited])
      if (terminating) await terminating
      signal.throwIfAborted()
      return {
        text: `${stdout}${stderr}${truncated ? '\n[output truncated to retained tail]' : ''}`,
        isError: code !== 0,
        details: { code, truncated },
      }
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
    }
  }
}

export const executionPlugin = definePlugin({
  manifest: {
    id: 'execution.local',
    name: 'Local execution',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: 'Workspace files and managed local processes',
    scope: 'host',
    required: true,
    provides: { execution: '1.0.0' },
    permissions: ['fs', 'process'],
  },
  apply(ctx) {
    provide(ctx, 'execution', new LocalExecution())
  },
})
export default definePlugin({
  manifest: {
    id: 'tools.workspace',
    name: 'Workspace tools',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: 'Read, write, edit, and shell tools',
    scope: 'host',
    requires: { execution: '^1.0.0' },
    permissions: ['fs', 'process'],
  },
  apply(ctx) {
    const execution = ctx.hbar.api.service<ExecutionProvider>('execution')
    const register = ctx.hbar.api.tools.register
    register({
      name: 'read_file',
      description: 'Read a UTF-8 file inside the workspace.',
      inputSchema: z.object({ path: z.string().min(1) }),
      effect: 'read',
      execute: async (args, c) => ({ text: await execution.read(c.workspace.path, args.path as string) }),
    })
    register({
      name: 'write_file',
      description: 'Write a UTF-8 file inside the workspace. Requires user approval.',
      inputSchema: z.object({ path: z.string().min(1), text: z.string() }),
      effect: 'write',
      execute: async (args, c) => {
        c.signal.throwIfAborted()
        const details = await execution.write(c.workspace.path, args.path as string, args.text as string)
        return { text: `Wrote ${args.path}`, details }
      },
    })
    register({
      name: 'edit_file',
      description: 'Replace one exact occurrence of text in a workspace file. Requires approval.',
      inputSchema: z.object({ path: z.string().min(1), oldText: z.string().min(1), newText: z.string() }),
      effect: 'write',
      execute: async (args, c) => {
        const before = await execution.read(c.workspace.path, args.path as string)
        const oldText = args.oldText as string
        if (before.split(oldText).length !== 2)
          throw new HbarError('EDIT_CONFLICT', 'Expected exactly one matching occurrence')
        c.signal.throwIfAborted()
        const details = await execution.write(
          c.workspace.path,
          args.path as string,
          before.replace(oldText, args.newText as string),
        )
        return { text: `Edited ${args.path}`, details }
      },
    })
    register({
      name: 'shell',
      description: 'Execute a shell command in the workspace. Requires user approval.',
      inputSchema: z.object({ command: z.string().min(1).max(16000) }),
      effect: 'process',
      execute: (args, c) => execution.exec(c.workspace.path, args.command as string, c.signal),
    })
  },
})
