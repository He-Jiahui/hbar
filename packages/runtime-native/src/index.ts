import { HbarError } from '@hbar/contracts/errors'
import { RUNTIME_LIMITS, type RuntimeProcessTree, type RuntimeProcessTreePort } from '@hbar/contracts/runtime'
import { z } from 'zod'

interface NativeTree {
  active(): number
  terminate(): void
  close(): void
}
interface NativeModule {
  RuntimeProcessTree: new (pid: number) => NativeTree
  runtimeProcessGroupReady(pid: number): boolean
  enterRuntimeProcessGroup(): void
  terminateRuntimeProcessGroup(): void
}
function nativeModule(): NativeModule {
  let value: unknown
  try {
    value = require('../native/hbar_runtime_native.node')
  } catch {
    throw new HbarError(
      'RUNTIME_RESTART_REQUIRED',
      'Build the native runtime supervision module before starting the managed Host',
    )
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('RuntimeProcessTree' in value) ||
    typeof value.RuntimeProcessTree !== 'function' ||
    !('runtimeProcessGroupReady' in value) ||
    typeof value.runtimeProcessGroupReady !== 'function' ||
    !('enterRuntimeProcessGroup' in value) ||
    typeof value.enterRuntimeProcessGroup !== 'function' ||
    !('terminateRuntimeProcessGroup' in value) ||
    typeof value.terminateRuntimeProcessGroup !== 'function'
  )
    throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Native process supervision needs the current runtime module')
  return value as NativeModule
}
function domain(error: unknown): HbarError {
  return error instanceof HbarError
    ? error
    : new HbarError(
        'RUNTIME_PROCESS_TREE_UNCONFIRMED',
        error instanceof Error ? error.message : 'Native process tree operation failed',
      )
}

/** Called by the composition entry before importing any owned business module. */
export function enterRuntimeProcessGroup(): void {
  if (process.env.HBAR_RUNTIME_PROCESS_GROUP === '1' && process.platform !== 'win32')
    nativeModule().enterRuntimeProcessGroup()
}

/** Parent IPC loss also closes native descendants on platforms without kill-on-owner-close Jobs. */
export function exitRuntimeProcessGroup(code: number): never {
  if (process.env.HBAR_RUNTIME_PROCESS_GROUP === '1' && process.platform !== 'win32')
    nativeModule().terminateRuntimeProcessGroup()
  process.exit(code)
}

export function createRuntimeProcessTreePort(): RuntimeProcessTreePort {
  const native = nativeModule()
  return {
    environment: { HBAR_RUNTIME_PROCESS_GROUP: '1' },
    async attach(pid, signal) {
      z.number().int().positive().max(2_147_483_647).parse(pid)
      const deadline = Date.now() + RUNTIME_LIMITS.startupMs
      try {
        while (!native.runtimeProcessGroupReady(pid)) {
          signal.throwIfAborted()
          if (Date.now() >= deadline)
            throw new HbarError(
              'RUNTIME_PROCESS_TREE_UNCONFIRMED',
              'Owned process group did not prepare before its startup deadline',
            )
          await Bun.sleep(10)
        }
        signal.throwIfAborted()
        const tree = new native.RuntimeProcessTree(pid)
        let closed = false
        const result: RuntimeProcessTree = {
          terminate() {
            if (!closed) {
              try {
                tree.terminate()
              } catch (error) {
                throw domain(error)
              }
            }
          },
          async join(timeoutMs) {
            const end = Date.now() + timeoutMs
            try {
              while (!closed && tree.active() !== 0) {
                if (Date.now() >= end)
                  throw new HbarError('RUNTIME_PROCESS_TREE_UNCONFIRMED', 'Owned descendants have not actually exited')
                await Bun.sleep(10)
              }
            } catch (error) {
              throw domain(error)
            }
          },
          close() {
            if (!closed) {
              try {
                tree.close()
                closed = true
              } catch (error) {
                throw domain(error)
              }
            }
          },
        }
        return result
      } catch (error) {
        throw domain(error)
      }
    },
  }
}
