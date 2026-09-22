import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { optionalBundleExternals } from '../scripts/bundle-externals'

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

async function terminateProcess(pid: number): Promise<void> {
  const result = await runCommand(
    [
      'pwsh',
      '-NoProfile',
      '-Command',
      [
        `$targetProcessId = ${pid}`,
        'Stop-Process -Id $targetProcessId -Force -ErrorAction SilentlyContinue',
        'Wait-Process -Id $targetProcessId -Timeout 10 -ErrorAction SilentlyContinue',
        'if (Get-Process -Id $targetProcessId -ErrorAction SilentlyContinue) { throw "Process $targetProcessId is still running" }',
      ].join('; '),
    ],
    resolve('.'),
  )
  if (result.code !== 0) throw new Error(`Compiled Host ${pid} did not terminate: ${result.stderr}`)
}

test.skipIf(process.platform !== 'win32')(
  'compiled CLI starts its embedded Host and native workspace query engine',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-compiled-cli-'))
    const executable = join(root, 'hbar.exe')
    const workspace = join(root, 'workspace')
    const dataRoot = join(root, 'data')
    const cacheRoot = join(root, 'cache')
    let hostPid = 0
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

      const build = Bun.spawn(
        [
          process.execPath,
          'build',
          '--compile',
          'apps/cli/src/main.ts',
          'packages/storage/src/worker.ts',
          '--outfile',
          executable,
          ...optionalBundleExternals.flatMap((dependency) => ['--external', dependency]),
        ],
        { cwd: resolve('.'), stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
      )
      const [buildCode, buildError] = await Promise.all([build.exited, new Response(build.stderr).text()])
      expect(buildCode, buildError).toBe(0)

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
      const workflowStart = await runCommand(
        [
          ...target,
          'exec',
          'workflow.start',
          '--input-json',
          JSON.stringify({
            objective: 'Complete a compiled CLI workflow',
            items: [
              {
                id: 'ship',
                title: 'Ship through the compiled CLI',
                scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
                acceptanceChecks: [
                  {
                    id: 'review',
                    description: 'The compiled CLI user accepts the result',
                    verifier: { kind: 'user' },
                  },
                ],
              },
            ],
          }),
          '--idempotency-key',
          'compiled-workflow',
        ],
        workspace,
      )
      expect(workflowStart.code, workflowStart.stderr).toBe(0)
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

      const connection = JSON.parse(await readFile(join(dataRoot, 'settings', 'connection.json'), 'utf8')) as {
        pid: number
      }
      hostPid = connection.pid
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
            '$children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $targetPid })',
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
        hbarProcessCount: 1,
        directChildCount: 0,
      })
    } finally {
      if (!hostPid) {
        try {
          hostPid =
            (JSON.parse(await readFile(join(dataRoot, 'settings', 'connection.json'), 'utf8')) as { pid?: number })
              .pid ?? 0
        } catch {
          // The compiled CLI may have failed before starting its embedded Host.
        }
      }
      if (hostPid) await terminateProcess(hostPid)
      await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
    }
  },
  90_000,
)
