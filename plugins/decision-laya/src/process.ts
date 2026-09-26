import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { join } from 'node:path'

function ended(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
}
function exit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (ended(child)) return Promise.resolve()
  return new Promise<void>((done, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      child.removeListener('exit', finished)
      child.removeListener('error', failed)
    }
    const finished = () => {
      cleanup()
      done()
    }
    const failed = (error: Error) => {
      cleanup()
      reject(error)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Owned Laya process did not terminate'))
    }, timeoutMs)
    child.once('exit', finished)
    child.once('error', failed)
  })
}

/** Only accepts a process handle created by this plugin; never accepts a caller-provided PID. */
export async function stopOwnedProcess(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (ended(child) || child.pid === undefined) return
  if (process.platform === 'win32' && child.pid !== undefined) {
    // A Windows venv python.exe is a redirector with a real Python descendant.
    const killer = spawn(
      join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
      ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true, stdio: 'ignore' },
    )
    try {
      await exit(killer, timeoutMs)
      if (killer.exitCode !== 0 && !ended(child)) throw new Error('Could not terminate the owned Laya process tree')
      await exit(child, timeoutMs)
    } finally {
      if (!ended(killer)) killer.kill('SIGKILL')
    }
    return
  }
  child.kill('SIGTERM')
  try {
    await exit(child, timeoutMs)
  } catch {
    child.kill('SIGKILL')
    await exit(child, timeoutMs)
  }
}
