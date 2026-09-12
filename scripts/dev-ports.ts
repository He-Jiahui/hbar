import { createServer } from 'node:net'

/** Reserve an OS-selected local TCP port, then release it for a child process. */
export async function findFreePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      probe.close()
      reject(error)
    }
    probe.once('error', onError)
    probe.listen({ host: '127.0.0.1', port: 0 }, () => resolve())
  })
  const address = probe.address()
  if (address === null || typeof address === 'string') {
    probe.close()
    throw new Error('Unable to determine the allocated development port')
  }
  const port = address.port
  await new Promise<void>((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()))
  })
  return port
}

export function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`Invalid port: ${value}`)
  return port
}
