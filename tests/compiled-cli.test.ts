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

async function terminateProcess(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return
  }
  await Bun.sleep(200)
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

      const connection = JSON.parse(await readFile(join(dataRoot, 'settings', 'connection.json'), 'utf8')) as {
        pid: number
      }
      hostPid = connection.pid
    } finally {
      if (hostPid) await terminateProcess(hostPid)
      await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
    }
  },
  60_000,
)
