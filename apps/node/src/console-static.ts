import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

function within(root: string, path: string): boolean {
  const result = relative(root, path)
  return result === '' || (result !== '..' && !result.startsWith(`..${sep}`) && !isAbsolute(result))
}

/** Serve only built assets under B's own static root; the standalone entry owns its /node-console route. */
export async function nodeConsoleStaticResponse(request: Request, staticRoot: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 404 })
  let path: string
  try {
    path = decodeURIComponent(new URL(request.url).pathname)
  } catch {
    return new Response(null, { status: 404 })
  }
  if (path.includes('\\') || path.includes('\0') || path.split('/').includes('..'))
    return new Response(null, { status: 404 })
  const entry = path === '/' || path === '/node-console' || path === '/node-console/'
  const root = resolve(staticRoot)
  const target = resolve(root, entry ? 'index.html' : `.${path}`)
  if (!within(root, target)) return new Response(null, { status: 404 })
  try {
    const [canonicalRoot, canonicalTarget] = await Promise.all([realpath(root), realpath(target)])
    if (!within(canonicalRoot, canonicalTarget)) return new Response(null, { status: 404 })
    const file = Bun.file(canonicalTarget)
    if (!(await file.exists())) return new Response(null, { status: 404 })
    return new Response(request.method === 'HEAD' ? null : file, {
      headers: {
        'content-type': file.type,
        'x-content-type-options': 'nosniff',
        'cache-control': entry ? 'no-store' : 'public, max-age=3600',
        'referrer-policy': 'same-origin',
      },
    })
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ['ENOENT', 'ENOTDIR', 'EISDIR'].includes(String(error.code))
    )
      return new Response(null, { status: 404 })
    throw error
  }
}
