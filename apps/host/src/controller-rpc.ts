import { createHash } from 'node:crypto'
import { rpcSchemas, HbarError, type RpcMethod } from '@hbar/contracts'
import type { KernelControllerPort } from '@hbar/kernel/controller'
import type { ControllerApplication } from './controller-application'
import type { RuntimeControllerRequest, RuntimeControllerScope } from './runtime-controller-contract'

const owned = new Set([
  'command.execute',
  'command.getReceipt',
  'workspace.list',
  'workspace.get',
  'session.list',
  'session.get',
  'permission.get',
  'permission.set',
  'settings.catalog',
  'settings.snapshot',
  'settings.set',
  'settings.reset',
  'settings.search',
  'automation.get',
  'automation.set',
  'goal.get',
  'goal.create',
  'goal.update',
  'goal.set',
  'goal.clear',
  'plan.get',
  'plan.update',
  'plan.clear',
  'mode.get',
  'mode.set',
  'budget.get',
  'budget.set',
  'budget.clear',
  'git.status',
  'git.info',
  'git.diff',
  'git.log',
  'git.commit',
  'git.stage',
  'git.unstage',
  'git.branch',
  'git.worktree',
  'git.diff_to_remote',
  'workspace.create',
  'session.create',
  'session.move',
  'session.summaries',
  'session.snapshot',
  'session.rename',
  'session.archive',
  'session.fork',
  'session.export',
  'run.start',
  'run.cancel',
  'run.reorder',
  'approval.resolve',
  'user_input.resolve',
  'context.compact',
  'provider.save',
  'provider.delete',
  'plugin.set',
  'plugin.install',
  'plugin.scan',
  'plugin.remove',
  'plugin.enable',
  'plugin.disable',
  'plugin.resolve',
  'plugin.disableTree',
  'plugin.graph',
  'plugin.lock',
  'plugin.doctor',
  'browser.status',
  'browser.navigate',
  'browser.go',
  'browser.snapshot',
  'browser.click',
  'browser.type',
  'browser.press',
  'browser.screenshot',
  'browser.evaluate',
  'browser.close',
  'browser.history',
  'computer.status',
  'computer.screenshot',
  'computer.click',
  'computer.double_click',
  'computer.type',
  'computer.key',
  'computer.scroll',
  'computer.move',
  'computer.wait',
  'computer.launch',
  'file.read',
  'file.write',
  'file.list',
])
export function ownsControllerRpc(request: RuntimeControllerRequest, application: ControllerApplication): boolean {
  if (request.method === 'command.execute')
    return application.commandDispatchers.has(rpcSchemas['command.execute'].parse(request.params).commandId)
  return owned.has(request.method)
}
export async function invokeControllerRpc(
  request: RuntimeControllerRequest,
  scope: RuntimeControllerScope,
  application: ControllerApplication,
  kernel: KernelControllerPort,
): Promise<unknown> {
  const {
    browserCommands,
    computerCommands,
    configurationCommands,
    extensionCommands,
    gitCommands,
    workspaceSessionCommands,
    budgetCommands,
    goalPlanCommands,
    interactionCommands,
    runCommands,
    commandRouter,
  } = application
  const { method, params: raw, id: rpcId } = request
  const socket = { data: { deviceId: scope.actorId } }
  function legacyCommandOptions(method: RpcMethod, rpcId: string | number, actor: typeof socket, idempotent = false) {
    const requestId =
      'legacy-' +
      createHash('sha256')
        .update(method + ':' + String(rpcId))
        .digest('hex')
        .slice(0, 32)
    return { actorId: actor.data.deviceId, requestId, ...(idempotent ? { idempotencyKey: requestId } : {}) }
  }
  switch (method) {
    case 'command.execute': {
      const invocation = rpcSchemas[method].parse(raw)
      if (!socket.data.deviceId) throw new HbarError('UNAUTHORIZED', 'Authenticated device required')
      return commandRouter.execute(invocation, socket.data.deviceId)
    }
    case 'command.getReceipt': {
      const input = rpcSchemas[method].parse(raw)
      if (!socket.data.deviceId) throw new HbarError('UNAUTHORIZED', 'Authenticated device required')
      if (input.commandId === 'run.submit' || input.commandId === 'run.retry')
        return runCommands.getReceipt(input.commandId, input.sessionId, socket.data.deviceId, input.idempotencyKey)
      if (input.commandId === 'queuedRun.editText')
        return runCommands.getQueuedEditTextReceipt(input.sessionId, socket.data.deviceId, input.idempotencyKey)
      if (input.commandId === 'queuedRun.remove')
        return runCommands.getQueuedRemoveReceipt(input.sessionId, socket.data.deviceId, input.idempotencyKey)
      if (input.commandId === 'queuedRun.guide')
        return runCommands.getQueuedRunGuideReceipt(input.sessionId, socket.data.deviceId, input.idempotencyKey)
      return budgetCommands.getReceipt(input.sessionId, socket.data.deviceId, input.idempotencyKey)
    }
    case 'workspace.list':
      return kernel.directoryQueries.execute('workspace.list', rpcSchemas['workspace.list'].parse(raw))
    case 'workspace.get':
      return kernel.directoryQueries.execute('workspace.get', rpcSchemas['workspace.get'].parse(raw))
    case 'session.list':
      return kernel.directoryQueries.execute('session.list', rpcSchemas['session.list'].parse(raw))
    case 'session.get':
      return kernel.directoryQueries.execute('session.get', rpcSchemas['session.get'].parse(raw))
    case 'permission.get':
      return { mode: kernel.permissionMode() }
    case 'permission.set': {
      const p = rpcSchemas[method].parse(raw)
      return configurationCommands.execute('permission.set', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'settings.catalog':
      return kernel.settingsCatalog()
    case 'settings.snapshot': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.settingsSnapshot(p.scope, p.targetId)
    }
    case 'settings.set': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.setSetting(p.scope, p.targetId, p.id, p.value, p.expectedRevision)
    }
    case 'settings.reset': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.resetSetting(p.scope, p.targetId, p.id, p.expectedRevision)
    }
    case 'settings.search': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.searchSettings(p.query)
    }
    case 'automation.get': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.automationGet(p.sessionId)
    }
    case 'automation.set': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.automationSet(p.sessionId, p.unattended, p.goalEnabled)
    }
    case 'goal.get': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('goal').get(p.sessionId)
    }
    case 'goal.create': {
      const p = rpcSchemas[method].parse(raw)
      return goalPlanCommands.execute('goal.create', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'goal.update': {
      const p = rpcSchemas[method].parse(raw)
      return goalPlanCommands.execute('goal.update', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'goal.set': {
      const p = rpcSchemas[method].parse(raw)
      return goalPlanCommands.execute('goal.set', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'goal.clear': {
      const p = rpcSchemas[method].parse(raw)
      return goalPlanCommands.execute('goal.clear', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'plan.get': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('plan').get(p.sessionId)
    }
    case 'plan.update': {
      const p = rpcSchemas[method].parse(raw)
      return goalPlanCommands.execute('plan.update', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'plan.clear': {
      const p = rpcSchemas[method].parse(raw)
      return goalPlanCommands.execute('plan.clear', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'mode.get': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('mode').get(p.sessionId)
    }
    case 'mode.set': {
      const p = rpcSchemas[method].parse(raw)
      return configurationCommands.execute('mode.set', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'budget.get': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('budget').get(p.sessionId)
    }
    case 'budget.set': {
      const p = rpcSchemas[method].parse(raw)
      const receipt = await budgetCommands.execute(
        'session.setBudget',
        { sessionId: p.sessionId, tokens: p.limit },
        legacyCommandOptions(method, rpcId, socket, true),
      )
      return receipt.budget
    }
    case 'budget.clear': {
      const p = rpcSchemas[method].parse(raw)
      return budgetCommands.execute('session.clearBudget', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'git.status': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('git').status(p.cwd)
    }
    case 'git.info': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('git').info(p.cwd)
    }
    case 'git.diff': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('git').diff(p.cwd, p)
    }
    case 'git.log': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('git').log(p.cwd, p.limit)
    }
    case 'git.commit': {
      const p = rpcSchemas[method].parse(raw)
      return gitCommands.execute('git.commit', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'git.stage': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('git').stage(p.cwd, p.paths)
    }
    case 'git.unstage': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('git').unstage(p.cwd, p.paths)
    }
    case 'git.branch': {
      const p = rpcSchemas[method].parse(raw)
      return gitCommands.execute('git.branch', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'git.worktree': {
      const p = rpcSchemas[method].parse(raw)
      return gitCommands.execute('git.worktree', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'git.diff_to_remote': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('git').diffToRemote(p.cwd, undefined, p.paths)
    }
    case 'workspace.create': {
      const p = rpcSchemas[method].parse(raw)
      return workspaceSessionCommands.execute('workspace.create', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'session.create': {
      const p = rpcSchemas[method].parse(raw)
      return workspaceSessionCommands.execute('session.create', p, legacyCommandOptions(method, rpcId, socket, true))
    }
    case 'session.move': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.moveSession(p.sessionId, p.workspaceId)
    }
    case 'session.summaries': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.sessionSummaries(p.sessionIds)
    }
    case 'session.snapshot': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.snapshot(p.sessionId, p.before, p.limit)
    }
    case 'session.rename': {
      const p = rpcSchemas[method].parse(raw)
      return workspaceSessionCommands.execute('session.rename', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'session.archive': {
      const p = rpcSchemas[method].parse(raw)
      return workspaceSessionCommands.execute('session.archive', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'session.fork': {
      const p = rpcSchemas[method].parse(raw)
      return workspaceSessionCommands.execute('session.fork', p, legacyCommandOptions(method, rpcId, socket, true))
    }
    case 'session.export': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.storage.call('events', p.sessionId, 0, 100_000)
    }
    case 'run.start': {
      const p = rpcSchemas[method].parse(raw)
      const accepted = await runCommands.execute(
        'run.submit',
        { sessionId: p.sessionId, input: p.input, modelId: p.modelId },
        {
          ...legacyCommandOptions(method, rpcId, socket),
          idempotencyKey: p.requestId,
        },
      )
      return kernel.storage.call('run', accepted.operationId)
    }
    case 'run.cancel': {
      const p = rpcSchemas[method].parse(raw)
      await runCommands.execute(
        'operation.cancel',
        { operationId: p.runId },
        legacyCommandOptions(method, rpcId, socket),
      )
      return null
    }
    case 'run.reorder': {
      const p = rpcSchemas[method].parse(raw)
      await kernel.reorderQueued(p.sessionId, p.runIds)
      return null
    }
    case 'approval.resolve': {
      const p = rpcSchemas[method].parse(raw)
      const approval = await kernel.storage.call('approval', p.approvalId)
      await interactionCommands.execute(
        'approval.resolve',
        { sessionId: approval.sessionId, approvalId: p.approvalId, decision: p.decision },
        legacyCommandOptions(method, rpcId, socket),
      )
      return null
    }
    case 'user_input.resolve': {
      const p = rpcSchemas[method].parse(raw)
      const request = kernel.pendingUserInput(p.requestId)
      if (!request) return { accepted: false }
      const result = await interactionCommands.execute(
        'questionnaire.answer',
        { sessionId: request.sessionId, requestId: p.requestId, answers: p.answers },
        legacyCommandOptions(method, rpcId, socket),
      )
      return { accepted: result.accepted }
    }
    case 'context.compact': {
      const p = rpcSchemas[method].parse(raw)
      return runCommands.execute('context.compact', p, { actorId: socket.data.deviceId! })
    }
    case 'provider.save': {
      const p = rpcSchemas[method].parse(raw)
      return configurationCommands.execute('provider.save', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'provider.delete': {
      const p = rpcSchemas[method].parse(raw)
      await configurationCommands.execute('provider.delete', p, legacyCommandOptions(method, rpcId, socket))
      return null
    }
    case 'plugin.set': {
      const p = rpcSchemas[method].parse(raw)
      return extensionCommands.execute('plugin.set', p, { actorId: socket.data.deviceId! })
    }
    case 'plugin.install': {
      const p = rpcSchemas[method].parse(raw)
      return extensionCommands.execute('plugin.install', p, { actorId: socket.data.deviceId! })
    }
    case 'plugin.scan':
      return extensionCommands.execute('plugin.scan', {})
    case 'plugin.remove': {
      const p = rpcSchemas[method].parse(raw)
      return extensionCommands.execute('plugin.remove', p, { actorId: socket.data.deviceId! })
    }
    case 'plugin.enable': {
      const p = rpcSchemas[method].parse(raw)
      return extensionCommands.execute('plugin.enable', p, { actorId: socket.data.deviceId! })
    }
    case 'plugin.disable': {
      const p = rpcSchemas[method].parse(raw)
      return extensionCommands.execute('plugin.disable', p, { actorId: socket.data.deviceId! })
    }
    case 'plugin.resolve': {
      const p = rpcSchemas[method].parse(raw)
      return extensionCommands.execute('plugin.resolve', p)
    }
    case 'plugin.disableTree': {
      const input = rpcSchemas[method].parse(raw)
      return kernel.changePluginTree(input.id, input.projectId)
    }
    case 'plugin.graph':
      return extensionCommands.execute('plugin.graph', {})
    case 'plugin.lock':
      return extensionCommands.execute('plugin.lock', {})
    case 'plugin.doctor':
      return extensionCommands.execute('plugin.doctor', {})
    case 'browser.status': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('browser').status(p.sessionId)
    }
    case 'browser.navigate': {
      const p = rpcSchemas[method].parse(raw)
      return browserCommands.execute('browser.navigate', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'browser.go': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('browser').go(p.sessionId, p.action, p.contextId, p.pageId)
    }
    case 'browser.snapshot': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('browser').snapshot(p.sessionId, p.contextId, p.pageId)
    }
    case 'browser.click': {
      const p = rpcSchemas[method].parse(raw)
      return browserCommands.execute('browser.click', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'browser.type': {
      const p = rpcSchemas[method].parse(raw)
      return browserCommands.execute('browser.type', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'browser.press': {
      const p = rpcSchemas[method].parse(raw)
      return browserCommands.execute('browser.press', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'browser.screenshot': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('browser').screenshot(p.sessionId, p.fullPage, p.contextId, p.pageId)
    }
    case 'browser.evaluate': {
      const p = rpcSchemas[method].parse(raw)
      return browserCommands.execute('browser.evaluate', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'browser.close': {
      const p = rpcSchemas[method].parse(raw)
      return browserCommands.execute('browser.close', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'browser.history': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('browser').history(p.sessionId, p.contextId)
    }
    case 'computer.status': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('computer').status(p.sessionId)
    }
    case 'computer.screenshot': {
      const p = rpcSchemas[method].parse(raw)
      return kernel.plugins.get('computer').screenshot(p.sessionId, p.appId)
    }
    case 'computer.click': {
      const p = rpcSchemas[method].parse(raw)
      return computerCommands.execute('computer.click', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'computer.double_click': {
      const p = rpcSchemas[method].parse(raw)
      return computerCommands.execute('computer.doubleClick', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'computer.type': {
      const p = rpcSchemas[method].parse(raw)
      return computerCommands.execute('computer.type', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'computer.key': {
      const p = rpcSchemas[method].parse(raw)
      return computerCommands.execute('computer.key', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'computer.scroll': {
      const p = rpcSchemas[method].parse(raw)
      return computerCommands.execute('computer.scroll', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'computer.move': {
      const p = rpcSchemas[method].parse(raw)
      return computerCommands.execute('computer.move', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'computer.wait': {
      const p = rpcSchemas[method].parse(raw)
      return computerCommands.execute('computer.wait', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'computer.launch': {
      const p = rpcSchemas[method].parse(raw)
      return computerCommands.execute('computer.launch', p, legacyCommandOptions(method, rpcId, socket))
    }
    case 'file.read': {
      const p = rpcSchemas[method].parse(raw)
      const workspace = await kernel.storage.call('workspace', p.workspaceId)
      const root = await kernel.workspaceSandboxes.prepare(workspace.id, workspace.path, AbortSignal.timeout(30_000))
      const text = await kernel.plugins.get('execution').read(root, p.path)
      return {
        text,
        path: p.path,
        revision: createHash('sha256').update(text, 'utf8').digest('hex'),
      }
    }
    case 'file.write': {
      const p = rpcSchemas[method].parse(raw)
      const workspace = await kernel.storage.call('workspace', p.workspaceId)
      const root = await kernel.workspaceSandboxes.prepare(workspace.id, workspace.path, AbortSignal.timeout(30_000))
      const details = await kernel.plugins.get('execution').write(root, p.path, p.text, {
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
      const root = await kernel.workspaceSandboxes.prepare(workspace.id, workspace.path, AbortSignal.timeout(30_000))
      return kernel.plugins.get('execution').list(root, p.path)
    }
    case 'command.catalog':
    case 'command.describe':
    case 'operation.watch':
    case 'operation.unwatch':
    case 'metrics.watch':
    case 'metrics.unwatch':
    case 'command.client.register':
    case 'command.client.unregister':
    case 'command.client.reply':
    case 'command.client.list':
    case 'surface.register':
    case 'surface.unregister':
    case 'surface.list':
    case 'surface.invoke':
    case 'surface.resolve':
    case 'schema.content.query':
    case 'schema.content.cancel':
    case 'system.hello':
    case 'system.runtime.watch':
    case 'system.runtime.unwatch':
    case 'system.bootstrap':
    case 'system.diagnose':
    case 'system.skills.list':
    case 'system.paths.get':
    case 'system.paths.validate':
    case 'system.paths.set':
    case 'system.restart':
    case 'session.follow':
    case 'session.unfollow':
    case 'terminal.open':
    case 'terminal.input':
    case 'terminal.resize':
    case 'terminal.close':
    case 'terminal.list':
    case 'device.list':
    case 'device.revoke':
    case 'pairing.create':
      throw new HbarError('METHOD_NOT_FOUND', 'This method belongs to the stable connection adapter')
  }
}
