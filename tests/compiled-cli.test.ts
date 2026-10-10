import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildStandaloneCli } from '../scripts/build-cli'
import { runtimeSnapshotSchema } from '@hbar/contracts/runtime'
import { z } from 'zod'

interface JsonLine {
  type?: string
  message?: {
    role?: string
    content?: Array<{
      type?: string
      name?: string
      text?: string
      isError?: boolean
      details?: { matchCount?: number; cache?: { bytesRead?: number } }
    }>
  }
}

interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

async function runCommand(command: string[], cwd: string, env?: Record<string, string>): Promise<CommandResult> {
  const child = Bun.spawn(command, {
    cwd,
    ...(env ? { env: { ...process.env, ...env } } : {}),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { code, stdout: stdout.trim(), stderr: stderr.trim() }
}

async function runGit(cwd: string, ...args: string[]): Promise<void> {
  const result = await runCommand(['git', ...args], cwd)
  if (result.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
}

async function terminateProcess(pid: number, executable: string): Promise<void> {
  const result = await runCommand(
    [
      'pwsh',
      '-NoProfile',
      '-Command',
      [
        `$targetProcessId = ${pid}`,
        "$expectedExecutable = [Environment]::GetEnvironmentVariable('HBAR_COMPILED_STOP_EXE')",
        '$ownedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $targetProcessId"',
        'if ($ownedProcess -and $ownedProcess.ExecutablePath -ine $expectedExecutable) { throw "Test PID no longer belongs to the fixture executable" }',
        'Stop-Process -Id $targetProcessId -Force -ErrorAction SilentlyContinue',
        'Wait-Process -Id $targetProcessId -Timeout 10 -ErrorAction SilentlyContinue',
        'if (Get-Process -Id $targetProcessId -ErrorAction SilentlyContinue) { throw "Process $targetProcessId is still running" }',
      ].join('; '),
    ],
    resolve('.'),
    { HBAR_COMPILED_STOP_EXE: executable },
  )
  if (result.code !== 0) throw new Error(`Compiled Host ${pid} did not terminate: ${result.stderr}`)
}

async function cleanupFixture(root: string, dataRoot: string, workspace: string, executable: string): Promise<void> {
  try {
    const connection = z.object({ pid: z.number().int().positive(), supervisorPid: z.number().int().positive().optional() })
      .parse(JSON.parse(await readFile(join(dataRoot, 'settings', 'connection.json'), 'utf8')))
    // Stop the exact fixture launcher first; its intentional disconnect stops the entry and all unit owners.
    await terminateProcess(connection.supervisorPid ?? connection.pid, executable)
    const deadline = Date.now() + 15_000
    let confirmed = false
    while (Date.now() < deadline) {
      const remaining = await runCommand(['powershell', '-NoProfile', '-Command',
        "$expectedExecutable = [Environment]::GetEnvironmentVariable('HBAR_COMPILED_STOP_EXE'); @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -ieq $expectedExecutable }).Count"],
      workspace, { HBAR_COMPILED_STOP_EXE: executable })
      if (remaining.code !== 0) throw new Error('Could not confirm the fixture unit owners exited')
      if (remaining.stdout === '0') { confirmed = true; break }
      await Bun.sleep(100)
    }
    if (!confirmed) throw new Error('Fixture runtime process exit was not confirmed before cleanup')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
}

test.skipIf(process.platform !== 'win32')(
  'compiled CLI starts its embedded Host and native workspace query engine',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-compiled-cli-'))
    const executable = join(root, 'hbar.exe')
    const workspace = join(root, 'workspace')
    const dataRoot = join(root, 'data')
    const cacheRoot = join(root, 'cache')
    try {
      await Promise.all([mkdir(workspace), mkdir(dataRoot), mkdir(cacheRoot)])
      await writeFile(join(workspace, 'alpha.ts'), 'first\nneedle 世界\nlast\n', 'utf8')
      await writeFile(join(workspace, '.gitignore'), 'ignored.ts\n', 'utf8')
      await writeFile(join(workspace, 'ignored.ts'), 'needle ignored\n', 'utf8')
      await writeFile(join(workspace, 'patch.txt'), 'parent\n', 'utf8')
      await runGit(workspace, 'init')
      await runGit(workspace, 'config', 'user.name', 'hbar compiled CLI test')
      await runGit(workspace, 'config', 'user.email', 'hbar-compiled-cli@example.invalid')
      await runGit(workspace, 'add', 'alpha.ts', '.gitignore', 'patch.txt')
      await runGit(workspace, 'commit', '-m', 'compiled CLI fixture')

      await buildStandaloneCli(resolve('.'), executable)

      const run = Bun.spawn(
        [
          executable,
          '--headless',
          '--demo',
          '--data-root',
          dataRoot,
          '--cache-root',
          cacheRoot,
          '--project',
          workspace,
          '--output-format',
          'jsonl',
          '--approval',
          'deny',
          '--message',
          '/tool search_text {"pattern":"needle","literal":true,"include":["**/*.ts"]}',
        ],
        { cwd: workspace, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
      )
      const [code, stdout, stderr] = await Promise.all([
        run.exited,
        new Response(run.stdout).text(),
        new Response(run.stderr).text(),
      ])
      expect(code, stderr).toBe(0)
      const records = stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as JsonLine)
      const result = records
        .flatMap((record) => record.message?.content ?? [])
        .find((content) => content.type === 'tool_result' && content.name === 'search_text')
      expect(result).toMatchObject({
        isError: false,
        text: 'alpha.ts:2:1:needle 世界\n',
        details: { matchCount: 1 },
      })
      expect(result?.details?.cache?.bytesRead).toBeGreaterThan(0)

      const common = [executable, '--demo', '--data-root', dataRoot, '--cache-root', cacheRoot, '--project', workspace]
      const created = await runCommand([...common, 'session', 'new'], workspace)
      expect(created.code, created.stderr).toBe(0)
      const session = JSON.parse(created.stdout) as { id: string }
      const target = [...common, '--session', session.id]
      const planUpdate = await runCommand(
        [
          ...target,
          'exec',
          'plan.update',
          '--input-json',
          JSON.stringify({
            explanation: 'Drive the compiled CLI through the authoritative Agent Plan',
            plan: [{ step: 'Ship through the compiled CLI', status: 'in_progress' }],
          }),
        ],
        workspace,
      )
      expect(planUpdate.code, planUpdate.stderr).toBe(0)
      const planRevision = (JSON.parse(planUpdate.stdout) as { revision: number }).revision
      const workflowFocus = await runCommand(
        [
          ...target,
          'exec',
          'workflow.focus.set',
          '--input-json',
          JSON.stringify({
            stepIndex: 0,
            item: {
              id: 'ship',
              title: 'Ignored in favor of the Agent Plan step',
              scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
              acceptanceChecks: [
                {
                  id: 'review',
                  description: 'The compiled CLI user accepts the result',
                  verifier: { kind: 'user' },
                },
              ],
            },
            completionPolicy: 'user',
            expectedPlanRevision: planRevision,
          }),
        ],
        workspace,
      )
      expect(workflowFocus.code, workflowFocus.stderr).toBe(0)
      const waiting = await runCommand(
        [
          ...target,
          'exec',
          'workflow.checkpoint',
          '--input-json',
          JSON.stringify({
            itemId: 'ship',
            outcome: 'complete',
            summary: 'Ready for explicit compiled CLI acceptance',
            nextItemId: null,
            expectedRevision: 1,
          }),
        ],
        workspace,
      )
      expect(waiting.code, waiting.stderr).toBe(0)
      expect(JSON.parse(waiting.stdout)).toMatchObject({ workflow: { revision: 2, status: 'waiting_user' } })
      const accepted = await runCommand(
        [
          ...target,
          'exec',
          'workflow.acceptCheck',
          '--input-json',
          JSON.stringify({
            itemId: 'ship',
            checkId: 'review',
            decision: 'accepted',
            note: 'Accepted through the compiled CLI',
            expectedRevision: 2,
          }),
        ],
        workspace,
      )
      expect(accepted.code, accepted.stderr).toBe(0)
      const checkpoint = await runCommand(
        [
          ...target,
          'exec',
          'workflow.checkpoint',
          '--input-json',
          JSON.stringify({
            itemId: 'ship',
            outcome: 'complete',
            summary: 'Compiled CLI acceptance is recorded',
            nextItemId: null,
            expectedRevision: 3,
          }),
        ],
        workspace,
      )
      expect(checkpoint.code, checkpoint.stderr).toBe(0)
      expect(JSON.parse(checkpoint.stdout)).toMatchObject({ workflow: { revision: 5, status: 'completed' } })

      const createdAgent = await runCommand(
        [
          ...target,
          'exec',
          'agent.create',
          '--input-json',
          JSON.stringify({
            objective: `/tool write_file ${JSON.stringify({ path: 'patch.txt', text: 'child from compiled CLI\n' })}`,
            modelId: 'local-fixture',
            approval: 'allow',
            patchTask: {
              itemId: 'compiled-patch',
              planRevision: 1,
              scope: { readPaths: ['patch.txt'], writePaths: ['patch.txt'], tools: ['write_file'] },
              acceptanceChecks: [],
            },
          }),
          '--idempotency-key',
          'compiled-agent',
        ],
        workspace,
      )
      expect(createdAgent.code, createdAgent.stderr).toBe(0)
      const agentId = (JSON.parse(createdAgent.stdout) as { agentId: string }).agentId
      const deadline = Date.now() + 10_000
      let agentResult: { patch?: { status: string } | null } = {}
      while (!agentResult.patch) {
        const queried = await runCommand([...target, 'exec', 'agent.result.get', agentId], workspace)
        expect(queried.code, queried.stderr).toBe(0)
        agentResult = JSON.parse(queried.stdout) as typeof agentResult
        if (Date.now() > deadline) throw new Error('Timed out waiting for compiled CLI Agent patch')
        if (!agentResult.patch) await Bun.sleep(25)
      }
      expect(agentResult.patch).toMatchObject({ status: 'ready' })
      expect(await readFile(join(workspace, 'patch.txt'), 'utf8')).toBe('parent\n')
      const applied = await runCommand(
        [
          ...target,
          'exec',
          'agent.patch.apply',
          agentId,
          '--plan-revision',
          '1',
          '--idempotency-key',
          'compiled-apply',
        ],
        workspace,
      )
      expect(applied.code, applied.stderr).toBe(0)
      expect(JSON.parse(applied.stdout)).toMatchObject({ patch: { status: 'applied' } })
      expect(await readFile(join(workspace, 'patch.txt'), 'utf8')).toBe('child from compiled CLI\n')

      const runtimeResult = await runCommand([...common, 'exec', 'system.runtime.get', '--input-json', '{}'], workspace)
      expect(runtimeResult.code, runtimeResult.stderr).toBe(0)
      const runtime = runtimeSnapshotSchema.parse(JSON.parse(runtimeResult.stdout))
      const managedPids = runtime.units.flatMap(unit => unit.generations.map(generation => generation.pid)).filter(pid => pid !== null)
      expect(runtime.ready).toBe(true)
      expect(managedPids).toHaveLength(4)
      const connection = JSON.parse(await readFile(join(dataRoot, 'settings', 'connection.json'), 'utf8')) as {
        pid: number
      }
      const hostPid = connection.pid
      const processSnapshot = await runCommand(
        [
          'powershell',
          '-NoProfile',
          '-Command',
          [
            "$targetPath = [Environment]::GetEnvironmentVariable('HBAR_COMPILED_EXE')",
            "$targetPid = [int][Environment]::GetEnvironmentVariable('HBAR_COMPILED_HOST_PID')",
            '$hostProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid"',
            "$sameExecutable = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'hbar.exe' -and $_.ExecutablePath -ieq $targetPath })",
            '$children = @($sameExecutable | Where-Object { $_.ParentProcessId -eq $targetPid })',
            '[ordered]@{ hostFound = $null -ne $hostProcess; hbarProcessCount = $sameExecutable.Count; directChildCount = $children.Count; commandLine = $hostProcess.CommandLine } | ConvertTo-Json -Compress',
          ].join('; '),
        ],
        workspace,
        {
          HBAR_COMPILED_EXE: executable,
          HBAR_COMPILED_HOST_PID: String(hostPid),
        },
      )
      expect(processSnapshot.code, processSnapshot.stderr).toBe(0)
      expect(JSON.parse(processSnapshot.stdout)).toMatchObject({
        hostFound: true,
        hbarProcessCount: managedPids.length + 2,
        directChildCount: managedPids.length,
      })
    } finally {
      await cleanupFixture(root, dataRoot, workspace, executable)
    }
  },
  90_000,
)
