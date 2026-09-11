import { networkInterfaces } from 'node:os'
import { createHash } from 'node:crypto'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { APP_VERSION, HbarError, PROTOCOL_VERSION, rpcRequestSchema, rpcSchemas } from '@hbar/contracts'
import type { HostInfo, RpcMethod, WireNotification } from '@hbar/contracts'
import type { ServerWebSocket } from 'bun'
import { Kernel } from '@hbar/kernel'
import type {
  BrowserUseService,
  BudgetService,
  ComputerUseService,
  ExecutionProvider,
  GitService,
  GoalService,
  ModeService,
  PlanService,
} from '@hbar/plugin-sdk'
import { Auth, requestToken } from './auth.ts'
import type { RuntimeScope } from '@hbar/kernel'

interface SocketData {
  token?: string | undefined
  deviceId?: string | undefined
  initialized: boolean
  follows: Set<string>
  pending: number
  timer?: ReturnType<typeof setTimeout> | undefined
  scope?: RuntimeScope | undefined
}
export interface ServerOptions {
  hostname?: string
  port?: number
  origins?: string[]
  staticRoot?: string
  cert?: string
  key?: string
}
export async function startServer(kernel: Kernel, options: ServerOptions = {}) {
  const hostname = options.hostname ?? '127.0.0.1'
  const auth = new Auth(kernel.storage)
  const pairing = auth.createPairing()
  const sockets = new Set<ServerWebSocket<SocketData>>()
  const addresses = [
    ...new Set(
      Object.values(networkInterfaces()).flatMap((list) =>
        (list ?? []).filter((item) => item.family === 'IPv4').map((item) => item.address),
      ),
    ),
  ]
  const allowedHosts = new Set([
    'localhost',
    '127.0.0.1',
    '[::1]',
    ...addresses,
    ...(hostname === '0.0.0.0' ? [] : [hostname]),
  ])
  const origins = new Set(options.origins ?? [])
  for (const origin of origins) allowedHosts.add(new URL(origin).hostname)
  const root = resolve(options.staticRoot ?? join(import.meta.dir, '../../../dist/web'))
  const secure = Boolean(options.cert && options.key)
  if (Boolean(options.cert) !== Boolean(options.key)) throw new Error('Configure both TLS certificate and key')
  let server: Bun.Server<SocketData>
  const hostInfo = (): HostInfo => ({
    version: APP_VERSION,
    protocol: PROTOCOL_VERSION,
    instanceId: kernel.instanceId,
    platform: process.platform,
    addresses: (hostname === '127.0.0.1' ? ['127.0.0.1'] : addresses).map(
      (ip) => `${secure ? 'https' : 'http'}://${ip}:${server.port}`,
    ),
    activeRuns: kernel.active.size,
    demo: Boolean(kernel.options.demo),
  })
  function validOrigin(request: Request) {
    const url = new URL(request.url)
    if (!allowedHosts.has(url.hostname)) return false
    const origin = request.headers.get('origin')
    return !origin || origin === url.origin || origins.has(origin)
  }
  function response(request: Request, body: BodyInit | null, status = 200, extra: HeadersInit = {}) {
    const headers = new Headers(extra)
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Referrer-Policy', 'no-referrer')
    headers.set('Cache-Control', 'no-store')
    const origin = request.headers.get('origin')
    if (origin && validOrigin(request)) {
      headers.set('Access-Control-Allow-Origin', origin)
      headers.set('Access-Control-Allow-Credentials', 'true')
      headers.set('Vary', 'Origin')
    }
    return new Response(body, { status, headers })
  }
  function json(request: Request, data: unknown, status = 200, headers: HeadersInit = {}) {
    return response(request, JSON.stringify(data), status, { 'Content-Type': 'application/json', ...headers })
  }
  function send(socket: ServerWebSocket<SocketData>, value: unknown) {
    if (socket.readyState !== 1) return
    if (socket.getBufferedAmount() > 4 * 1024 * 1024) {
      socket.close(1013, 'Reconnect to resynchronize')
      return
    }
    socket.send(JSON.stringify(value))
  }
  async function invoke(method: RpcMethod, raw: unknown, socket: ServerWebSocket<SocketData>): Promise<unknown> {
    switch (method) {
      case 'system.hello': {
        const params = rpcSchemas[method].parse(raw)
        if (socket.data.initialized) throw new HbarError('ALREADY_INITIALIZED', 'Connection already initialized')
        const token = params.token ?? socket.data.token
        const device = await auth.authenticate(token)
        socket.data.scope = await kernel.plugins.openScope('client', crypto.randomUUID())
        socket.data.token = token
        socket.data.deviceId = device.id
        socket.data.initialized = true
        clearTimeout(socket.data.timer)
        return hostInfo()
      }
      case 'system.bootstrap':
        return kernel.bootstrap(hostInfo())
      case 'system.diagnose':
        return {
          host: hostInfo(),
          database: await kernel.storage.call('stats'),
          recoveredRuns: kernel.recovered,
          plugins: kernel.plugins.list(),
          tools: kernel.tools.list().map((tool) => tool.name),
          streams: kernel.streams.size,
        }
      case 'system.paths.get':
        return kernel.paths()
      case 'system.paths.validate': {
        const p = z.object({ dataRoot: z.string().min(1), cacheRoot: z.string().min(1) }).parse(raw)
        return kernel.validatePaths(p.dataRoot, p.cacheRoot)
      }
      case 'system.paths.set': {
        const p = z.object({ dataRoot: z.string().min(1), cacheRoot: z.string().min(1) }).parse(raw)
        return kernel.setPaths(p.dataRoot, p.cacheRoot)
      }
      case 'system.restart':
        return { accepted: false, restartRequired: true }
      case 'permission.get':
        return { mode: kernel.permissionMode() }
      case 'permission.set': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.setPermissionMode(p.mode)
      }
      case 'goal.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GoalService>('goal').get(p.sessionId)
      }
      case 'goal.create': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GoalService>('goal').create(p.sessionId, p.objective, p.tokenBudget)
      }
      case 'goal.update': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GoalService>('goal').update(p.sessionId, p.status)
      }
      case 'goal.set': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GoalService>('goal').set(p.sessionId, p)
      }
      case 'goal.clear': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GoalService>('goal').clear(p.sessionId)
      }
      case 'plan.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<PlanService>('plan').get(p.sessionId)
      }
      case 'plan.update': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<PlanService>('plan').update(p.sessionId, p.plan, p.explanation, p.turnId)
      }
      case 'plan.clear': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<PlanService>('plan').clear(p.sessionId)
      }
      case 'mode.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ModeService>('mode').get(p.sessionId)
      }
      case 'mode.set': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ModeService>('mode').set(p.sessionId, p.mode)
      }
      case 'budget.get': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BudgetService>('budget').get(p.sessionId)
      }
      case 'budget.set': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BudgetService>('budget').set(p.sessionId, p.limit)
      }
      case 'budget.clear': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BudgetService>('budget').clear(p.sessionId)
      }
      case 'git.status': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').status(p.cwd)
      }
      case 'git.info': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').info(p.cwd)
      }
      case 'git.diff': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').diff(p.cwd, p)
      }
      case 'git.log': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').log(p.cwd, p.limit)
      }
      case 'git.commit': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').commit(p.cwd, p)
      }
      case 'git.stage': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').stage(p.cwd, p.paths)
      }
      case 'git.unstage': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').unstage(p.cwd, p.paths)
      }
      case 'git.branch': {
        const p = rpcSchemas[method].parse(raw)
        const operation = p.operation === 'list' ? {} : { operation: p.operation, name: p.name!, force: p.force }
        return kernel.plugins.get<GitService>('git').branch(p.cwd, operation)
      }
      case 'git.worktree': {
        const p = rpcSchemas[method].parse(raw)
        const operation =
          p.operation === 'list'
            ? {}
            : p.operation === 'add'
              ? { operation: 'add' as const, path: p.path!, branch: p.branch, createBranch: p.createBranch }
              : { operation: 'remove' as const, path: p.path!, force: p.force }
        return kernel.plugins.get<GitService>('git').worktree(p.cwd, operation)
      }
      case 'git.diff_to_remote': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<GitService>('git').diffToRemote(p.cwd)
      }
      case 'workspace.create': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.createWorkspace(p.path)
      }
      case 'session.create': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.createSession(p.workspaceId, p.title)
      }
      case 'session.snapshot': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.snapshot(p.sessionId, p.before, p.limit)
      }
      case 'session.follow': {
        const p = rpcSchemas[method].parse(raw)
        await kernel.storage.call('session', p.sessionId)
        socket.data.follows.add(p.sessionId)
        const events = await kernel.storage.call('events', p.sessionId, p.cursor, 2001)
        const session = await kernel.storage.call('session', p.sessionId)
        const reset = events.length > 2000 || p.cursor > session.seq
        return {
          events: reset ? [] : events,
          cursor: reset ? session.seq : (events.at(-1)?.seq ?? p.cursor),
          reset,
          streams: [...kernel.streams.values()].filter((s) => s.sessionId === p.sessionId),
        }
      }
      case 'session.unfollow': {
        const p = rpcSchemas[method].parse(raw)
        socket.data.follows.delete(p.sessionId)
        return null
      }
      case 'session.rename': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.updateSession(p.sessionId, { title: p.title })
      }
      case 'session.archive': {
        const p = rpcSchemas[method].parse(raw)
        if (kernel.active.has(p.sessionId)) throw new HbarError('BUSY', 'Stop the active run before archiving')
        return kernel.updateSession(p.sessionId, { archived: p.archived })
      }
      case 'session.fork': {
        const p = rpcSchemas[method].parse(raw)
        const session = await kernel.storage.call('fork', p.sessionId, p.atSeq)
        kernel.changed('sessions')
        return session
      }
      case 'session.export': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.storage.call('events', p.sessionId, 0, 100_000)
      }
      case 'run.start': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.submit(p.sessionId, p.requestId, p.input, p.modelId)
      }
      case 'run.cancel': {
        const p = rpcSchemas[method].parse(raw)
        await kernel.cancel(p.runId)
        return null
      }
      case 'approval.resolve': {
        const p = rpcSchemas[method].parse(raw)
        await kernel.resolveApproval(p.approvalId, p.decision)
        return null
      }
      case 'user_input.resolve': {
        const p = rpcSchemas[method].parse(raw)
        return { accepted: await kernel.resolveUserInput(p.requestId, p.answers) }
      }
      case 'context.compact': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.compact(p.sessionId, p.modelId)
      }
      case 'provider.save': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.saveProvider(p.provider, p.apiKey)
      }
      case 'provider.delete': {
        const p = rpcSchemas[method].parse(raw)
        await kernel.deleteProvider(p.id)
        return null
      }
      case 'plugin.set': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.changePlugin(p.id, p.enabled, p.config)
      }
      case 'plugin.install': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.installPlugin(p.path, p.projectId)
      }
      case 'plugin.scan':
        return kernel.plugins.list()
      case 'plugin.remove': {
        const p = rpcSchemas[method].parse(raw)
        kernel.assertIdle()
        const result = await kernel.plugins.remove(p.id)
        kernel.changed('plugins')
        return result
      }
      case 'plugin.enable': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.changePlugin(p.id, true)
      }
      case 'plugin.disable': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.changePlugin(p.id, false)
      }
      case 'plugin.resolve': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.resolve(p.id)
      }
      case 'plugin.graph':
        return kernel.plugins.graph()
      case 'plugin.lock':
        return kernel.plugins.lock()
      case 'plugin.doctor':
        return kernel.plugins.doctor()
      case 'browser.status': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').status(p.sessionId)
      }
      case 'browser.navigate': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').navigate(p.sessionId, p.url, p.contextId, p.pageId)
      }
      case 'browser.go': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').go(p.sessionId, p.action, p.contextId, p.pageId)
      }
      case 'browser.snapshot': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').snapshot(p.sessionId, p.contextId, p.pageId)
      }
      case 'browser.click': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').click(p.sessionId, p.selector, p.contextId, p.pageId)
      }
      case 'browser.type': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins
          .get<BrowserUseService>('browser')
          .type(p.sessionId, p.selector, p.text, p.contextId, p.pageId)
      }
      case 'browser.press': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins
          .get<BrowserUseService>('browser')
          .press(p.sessionId, p.key, p.selector, p.contextId, p.pageId)
      }
      case 'browser.screenshot': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins
          .get<BrowserUseService>('browser')
          .screenshot(p.sessionId, p.fullPage, p.contextId, p.pageId)
      }
      case 'browser.evaluate': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins
          .get<BrowserUseService>('browser')
          .evaluate(p.sessionId, p.expression, p.contextId, p.pageId)
      }
      case 'browser.close': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').close(p.sessionId, p.contextId, p.pageId)
      }
      case 'browser.history': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<BrowserUseService>('browser').history(p.sessionId, p.contextId)
      }
      case 'computer.status': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').status(p.sessionId)
      }
      case 'computer.screenshot': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').screenshot(p.sessionId, p.appId)
      }
      case 'computer.click': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').click(p.sessionId, p.x, p.y, p.appId)
      }
      case 'computer.double_click': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').doubleClick(p.sessionId, p.x, p.y, p.appId)
      }
      case 'computer.type': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').type(p.sessionId, p.text, p.appId)
      }
      case 'computer.key': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').key(p.sessionId, p.key, p.appId)
      }
      case 'computer.scroll': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').scroll(p.sessionId, p.deltaX, p.deltaY, p.appId)
      }
      case 'computer.move': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').move(p.sessionId, p.x, p.y, p.appId)
      }
      case 'computer.wait': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').wait(p.sessionId, p.milliseconds, p.appId)
      }
      case 'computer.launch': {
        const p = rpcSchemas[method].parse(raw)
        return kernel.plugins.get<ComputerUseService>('computer').launch(p.sessionId, p.appId)
      }
      case 'device.list':
        return kernel.storage.call('devices')
      case 'device.revoke': {
        const p = rpcSchemas[method].parse(raw)
        await kernel.storage.call('revokeDevice', p.id)
        for (const peer of sockets)
          if (peer.data.deviceId === p.id) {
            send(peer, { jsonrpc: '2.0', method: 'auth.revoked', params: { reason: 'Device access revoked' } })
            peer.close(4001, 'Revoked')
          }
        return null
      }
      case 'pairing.create':
        return auth.createPairing()
      case 'file.read': {
        const p = rpcSchemas[method].parse(raw)
        const workspace = await kernel.storage.call('workspace', p.workspaceId)
        const text = await kernel.plugins.get<ExecutionProvider>('execution').read(workspace.path, p.path)
        return {
          text,
          path: p.path,
          revision: createHash('sha256').update(text, 'utf8').digest('hex'),
        }
      }
      case 'file.write': {
        const p = rpcSchemas[method].parse(raw)
        const workspace = await kernel.storage.call('workspace', p.workspaceId)
        const details = await kernel.plugins.get<ExecutionProvider>('execution').write(workspace.path, p.path, p.text, {
          ...(p.expectedRevision ? { expectedRevision: p.expectedRevision } : {}),
        })
        return {
          text: details.after,
          path: details.path,
          revision: details.revision,
        }
      }
      case 'file.list': {
        const p = rpcSchemas[method].parse(raw)
        const workspace = await kernel.storage.call('workspace', p.workspaceId)
        return kernel.plugins.get<ExecutionProvider>('execution').list(workspace.path, p.path)
      }
    }
    throw new HbarError('METHOD_NOT_FOUND', method)
  }
  server = Bun.serve<SocketData>({
    hostname,
    port: options.port ?? 4317,
    maxRequestBodySize: 12 * 1024 * 1024,
    ...(secure ? { tls: { cert: await readFile(options.cert!), key: await readFile(options.key!) } } : {}),
    async fetch(request, host) {
      const url = new URL(request.url)
      if (!validOrigin(request)) return json(request, { error: 'Origin or Host is not allowed' }, 403)
      if (request.method === 'OPTIONS')
        return response(request, null, 204, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Filename',
        })
      try {
        if (url.pathname === '/healthz')
          return json(request, {
            ready: true,
            version: APP_VERSION,
            protocol: PROTOCOL_VERSION,
            instanceId: kernel.instanceId,
          })
        if (url.pathname === '/auth/pair' && request.method === 'POST') {
          const p = z.object({ code: z.string().max(32), name: z.string().min(1).max(100) }).parse(await request.json())
          const result = await auth.pair(p.code, p.name, host.requestIP(request)?.address ?? 'unknown')
          return json(request, result, 200, {
            'Set-Cookie': `hbar_device=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure ? '; Secure' : ''}`,
          })
        }
        if (url.pathname === '/auth/token' && request.method === 'POST') {
          const p = z.object({ token: z.string().max(512) }).parse(await request.json())
          const device = await auth.authenticate(p.token)
          return json(request, { device }, 200, {
            'Set-Cookie': `hbar_device=${p.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure ? '; Secure' : ''}`,
          })
        }
        if (url.pathname === '/rpc') {
          if (
            host.upgrade(request, {
              data: { token: requestToken(request), initialized: false, follows: new Set(), pending: 0 },
            })
          )
            return undefined
          return json(request, { error: 'WebSocket upgrade required' }, 426)
        }
        if (url.pathname.startsWith('/api/')) {
          await auth.authenticate(requestToken(request))
          const clientPlugin = /^\/api\/plugins\/([^/]+)\/client\.js$/.exec(url.pathname)
          if (clientPlugin && request.method === 'GET')
            return response(request, kernel.plugins.clientCode(decodeURIComponent(clientPlugin[1]!)), 200, {
              'Content-Type': 'text/javascript; charset=utf-8',
            })
          if (url.pathname === '/api/artifacts' && request.method === 'POST') {
            const name = decodeURIComponent(request.headers.get('x-filename') ?? 'image')
            return json(
              request,
              await kernel.upload(
                name,
                (request.headers.get('content-type') ?? '').split(';')[0]!,
                new Uint8Array(await request.arrayBuffer()),
              ),
            )
          }
          const match = /^\/api\/artifacts\/([a-f0-9]{64})$/.exec(url.pathname)
          if (match && request.method === 'GET') {
            const artifact = await kernel.storage.call('artifact', match[1]!)
            const disposition = artifact.mime.startsWith('image/') ? 'inline' : 'attachment'
            return response(request, Bun.file(join(kernel.options.layout.artifacts, artifact.id)), 200, {
              'Content-Type': artifact.mime,
              'Content-Security-Policy': "default-src 'none'",
              'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,
            })
          }
          return json(request, { error: 'Not found' }, 404)
        }
        if (request.method !== 'GET') return json(request, { error: 'Not found' }, 404)
        const path = resolve(root, `.${decodeURIComponent(url.pathname)}`)
        const rel = relative(root, path)
        if (rel.startsWith('..') || isAbsolute(rel)) return json(request, { error: 'Not found' }, 404)
        const file = Bun.file(path)
        const body = (await file.exists()) && url.pathname !== '/' ? file : Bun.file(join(root, 'index.html'))
        if (!(await body.exists())) return response(request, 'Build the web application with bun run build.', 503)
        return response(request, body, 200, {
          'Content-Type': body.type,
          'Content-Security-Policy':
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' ws: wss: ipc: http://ipc.localhost; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        })
      } catch (error) {
        const code = error instanceof HbarError ? error.code : 'INVALID_REQUEST'
        return json(
          request,
          { code, error: error instanceof Error ? error.message : String(error) },
          code === 'UNAUTHORIZED' || code === 'PAIRING_FAILED' ? 401 : code === 'RATE_LIMIT' ? 429 : 400,
        )
      }
    },
    websocket: {
      maxPayloadLength: 1024 * 1024,
      idleTimeout: 120,
      sendPings: true,
      open(socket) {
        sockets.add(socket)
        socket.data.timer = setTimeout(() => {
          if (!socket.data.initialized) socket.close(4001, 'Handshake required')
        }, 10_000)
      },
      async message(socket, payload) {
        let id: string | number | null = null
        let admitted = false
        try {
          if (socket.data.pending >= 32) throw new HbarError('OVERLOADED', 'Too many pending requests')
          socket.data.pending++
          admitted = true
          const request = rpcRequestSchema.parse(JSON.parse(typeof payload === 'string' ? payload : payload.toString()))
          id = request.id
          if (!Object.hasOwn(rpcSchemas, request.method)) throw new HbarError('METHOD_NOT_FOUND', request.method)
          if (request.method !== 'system.hello') {
            if (!socket.data.initialized) throw new HbarError('UNAUTHORIZED', 'Initialize the connection first')
            await auth.authenticate(socket.data.token)
          }
          const method = request.method as RpcMethod
          const params = rpcSchemas[method].parse(request.params)
          send(socket, { jsonrpc: '2.0', id, result: await invoke(method, params, socket) })
        } catch (error) {
          send(socket, {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32000,
              data: error instanceof HbarError ? error.code : 'INVALID_REQUEST',
              message: error instanceof Error ? error.message : String(error),
            },
          })
        } finally {
          if (admitted) socket.data.pending--
        }
      },
      close(socket) {
        clearTimeout(socket.data.timer)
        sockets.delete(socket)
        void socket.data.scope?.dispose().catch(console.error)
      },
    },
  })
  const unsubscribe = kernel.subscribe((event: WireNotification) => {
    for (const socket of sockets) {
      if (!socket.data.initialized) continue
      if (
        (event.method === 'session.event' || event.method === 'stream.update') &&
        !socket.data.follows.has(event.params.sessionId)
      )
        continue
      send(socket, { jsonrpc: '2.0', ...event })
    }
  })
  return {
    server,
    auth,
    pairing,
    info: hostInfo,
    async close() {
      unsubscribe()
      for (const socket of sockets) socket.close()
      await server.stop(true)
    },
  }
}
