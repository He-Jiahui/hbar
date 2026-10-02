import { basename, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'

const connectionSchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
  pid: z.number().int().positive().safe(),
  instanceId: z.string().min(1),
})

/** Validate before connecting or using a PID from a fixture's connection file. */
export function parseNativeSmokeConnection(value: unknown) {
  const connection = connectionSchema.parse(value)
  const url = new URL(connection.url)
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Native smoke connection must be a plain loopback HTTP origin')
  return connection
}

/** Recursive cleanup is restricted to one direct mkdtemp child, never the workspace. */
export function nativeSmokeFixtureRoot(root: string, temporaryDirectory = tmpdir()): string {
  const target = resolve(root)
  const name = basename(target)
  if (dirname(target) !== resolve(temporaryDirectory) || !/^hbar-native-[A-Za-z0-9]+$/.test(name))
    throw new Error('Refusing cleanup outside the owned native smoke fixture')
  return target
}

/** A PID alone is insufficient authority: verify the exact fixture data-root argument. */
export function ownsNativeSmokeHost(commandLine: string, root: string): boolean {
  const target = nativeSmokeFixtureRoot(root).toLowerCase()
  // Native launch emits whole quoted paths, not partially quoted shell expressions.
  const arguments_ = (commandLine.match(/"[^"]*"|\S+/g) ?? []).map((argument) =>
    argument.startsWith('"') && argument.endsWith('"') ? argument.slice(1, -1).toLowerCase() : argument.toLowerCase(),
  )
  return (
    (arguments_.includes('--supervisor') || arguments_.includes('--supervised')) &&
    arguments_.some((argument, index) => argument === '--data-root' && arguments_[index + 1] === target)
  )
}

export function redactNativeSmokeDiagnostics(text: string, token?: string): string {
  const redacted = token ? text.replaceAll(token, '[redacted token]') : text
  return redacted.replace(/Pairing code: \S+/g, 'Pairing code: [redacted]')
}

/** Bun exitCode may remain null after signal termination; the exited promise is authoritative. */
export async function waitForNativeSmokeExit(exited: Promise<number>, timeoutMs = 5_000): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      exited,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Owned native desktop has not exited')), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
