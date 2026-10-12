import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { createNodeIdentity, nodeIdFromPublicKey } from '@hbar/node-core'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
import { nodeCapabilitiesSchema } from '@hbar/contracts/node'

test('Kernel noLocalExec disables local workspace services and only exposes Host global skills to node Runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-no-local-exec-'))
  const localWorkspace = join(root, 'workspace')
  await mkdir(localWorkspace, { recursive: true })
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: localWorkspace,
    demo: true,
    noLocalExec: true,
    secrets: new MemorySecrets(),
  })
  try {
    const registeredLocalWorkspace = (await kernel.storage.call('workspaces'))[0]
    if (!registeredLocalWorkspace) throw new Error('Kernel did not register its local workspace')
    const localSession = await kernel.createSession(registeredLocalWorkspace.id)
    const sentinelPath = join(registeredLocalWorkspace.path, 'sentinel.txt')
    await writeFile(sentinelPath, 'unchanged')

    const conversation = await kernel.submit(
      localSession.id,
      'kernel-no-local-pure-conversation',
      { text: 'Reply with a brief greeting.', images: [] },
      'local-fixture',
    )
    await kernel.waitForIdle()
    expect((await kernel.storage.call('run', conversation.id)).status).toBe('completed')

    await kernel.setPermissionMode('allow')
    const invoke = async (name: string, args: object) => {
      await kernel.submit(
        localSession.id,
        `kernel-no-local-tool-${name}`,
        { text: `/tool ${name} ${JSON.stringify(args)}`, images: [] },
        'local-fixture',
      )
      await kernel.waitForIdle()
      const result = (await kernel.snapshot(localSession.id)).messages
        .flatMap((message) => message.content)
        .findLast((content) => content.type === 'tool_result' && content.name === name)
      if (!result || result.type !== 'tool_result') throw new Error(`Missing ${name} result`)
      return result
    }
    for (const [name, args] of [
      ['read_file', { path: 'sentinel.txt' }],
      ['write_file', { path: 'sentinel.txt', text: 'changed' }],
      ['shell', { command: 'echo changed > shell-sentinel.txt' }],
    ] as const) {
      const result = await invoke(name, args)
      expect(result.isError).toBe(true)
      expect(result.text).toContain('disabled by the Host runtime configuration')
    }
    expect(await Bun.file(sentinelPath).text()).toBe('unchanged')
    expect(await Bun.file(join(registeredLocalWorkspace.path, 'shell-sentinel.txt')).exists()).toBe(false)

    await expect(
      kernel.workspaceSandboxes.prepare('unused-workspace', localWorkspace, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'LOCAL_EXECUTION_DISABLED' })
    await expect(kernel.sessionLaunchTargets.workspaceForRun('unused-session', localWorkspace)).rejects.toMatchObject({
      code: 'LOCAL_EXECUTION_DISABLED',
    })

    const localSkillDirectory = join(localWorkspace, '.hbar', 'skills', 'node-only')
    const globalSkillDirectory = join(kernel.options.layout.globalSkills, 'host-global')
    await mkdir(localSkillDirectory, { recursive: true })
    await mkdir(globalSkillDirectory, { recursive: true })
    await writeFile(
      join(localSkillDirectory, 'SKILL.md'),
      '---\nname: node-only\ndescription: Must not be scanned\n---\n',
    )
    await writeFile(
      join(globalSkillDirectory, 'SKILL.md'),
      '---\nname: host-global\ndescription: Host-owned skill\n---\n',
    )

    const identity = createNodeIdentity()
    const nodeId = nodeIdFromPublicKey(identity.publicKey)
    const capabilities = nodeCapabilitiesSchema.parse({
      protocol: 1,
      nodeId,
      platform: 'linux',
      evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
      roots: [{ rootId: 'engine', name: 'Engine', nodePath: localWorkspace, access: 'write' }],
      sandbox: { backends: ['none'], filesystem: 'none', network: 'none' },
      floor: { process: true, network: false, terminal: false, osConfinement: 'off' },
    })
    await kernel.storage.call('nodeRegister', {
      nodeId,
      publicKey: identity.publicKey,
      name: 'Builder',
      createdAt: Date.now(),
    })
    await kernel.storage.call('nodeTouch', nodeId, Date.now(), capabilities)
    const workspace = await kernel.createNodeWorkspace({ nodeId, rootId: 'engine' })
    const session = await kernel.createSession(workspace.id)
    const contextSystems: string[] = []
    const removeContextHook = kernel.hooks.on('context.build', (request) => {
      contextSystems.push(request.system)
      return request
    })
    const run = await kernel.submit(
      session.id,
      'kernel-no-local-exec-context',
      { text: '/tool skill {"name":"host-global"}', images: [] },
      'local-fixture',
    )
    await kernel.waitForIdle()

    expect((await kernel.storage.call('run', run.id)).status).toBe('completed')
    expect(contextSystems.length).toBeGreaterThan(0)
    expect(contextSystems.every((system) => system.includes(`Work in ${localWorkspace}.`))).toBe(true)
    expect(contextSystems.some((system) => system.includes('Host-owned skill'))).toBe(true)
    expect(contextSystems.some((system) => system.includes('Must not be scanned'))).toBe(false)
    await removeContextHook()
  } finally {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
