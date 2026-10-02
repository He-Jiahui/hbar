import { resolve } from 'node:path'
import { z } from 'zod'
import { applyWorkspaceCleanup, inspectWorkspaceCleanup, type CleanupRuntime } from './workspace-cleanup'

const runtimeSchema = z.object({ javascriptActive: z.boolean(), previewActive: z.boolean(), rustActive: z.boolean() })
const argumentsList = Bun.argv.slice(2)
const apply = argumentsList.includes('--apply')
const workspaceFlag = argumentsList.indexOf('--workspace')
const workspace = workspaceFlag >= 0 ? argumentsList[workspaceFlag + 1] : resolve(import.meta.dir, '..')
if (
  !workspace ||
  argumentsList.some(
    (argument, index) =>
      argument !== '--apply' && argument !== '--workspace' && !(workspaceFlag >= 0 && index === workspaceFlag + 1),
  )
)
  throw new Error('Use clean-workspace.ts [--workspace <Git root>] [--apply].')

async function readRuntime(): Promise<CleanupRuntime> {
  if (process.platform !== 'win32') {
    const child = Bun.spawn(['ps', '-A', '-o', 'comm='], { stdout: 'pipe', stderr: 'pipe' })
    const names = await new Response(child.stdout).text()
    if ((await child.exited) !== 0) throw new Error('Could not inspect running build processes.')
    const javascriptActive = /(?:^|\n)(?:.*\/)?(?:node|bun)\s*(?:\n|$)/.test(names)
    return { javascriptActive, previewActive: javascriptActive, rustActive: /(?:cargo|rustc|hbar)(?:\n|$)/.test(names) }
  }
  // Return booleans only; process command lines and environment values are never printed.
  const script = String.raw`
    $cleanupProcesses = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne ${process.pid} })
    $cleanupJs = @($cleanupProcesses | Where-Object { $_.Name -eq 'bun.exe' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match '(vite|playwright)') })
    [PSCustomObject]@{
      javascriptActive = $cleanupJs.Count -gt 0
      previewActive = @($cleanupJs | Where-Object { $_.CommandLine -match '(?:^|\s)preview(?:\s|$)' }).Count -gt 0
      rustActive = @($cleanupProcesses | Where-Object { $_.Name -match '^(cargo|rustc|hbar|hbar-desktop)\.exe$' }).Count -gt 0
    } | ConvertTo-Json -Compress
  `
  const child = Bun.spawn(['powershell.exe', '-NoProfile', '-Command', script], { stdout: 'pipe', stderr: 'pipe' })
  const output = await new Response(child.stdout).text()
  const code = await child.exited
  if (code !== 0) throw new Error('Could not inspect running build processes.')
  return runtimeSchema.parse(JSON.parse(output))
}

const runtime = await readRuntime()
const plan = await inspectWorkspaceCleanup(workspace, runtime)
console.log(
  JSON.stringify(
    {
      mode: apply ? 'apply' : 'dry-run',
      workspace: resolve(workspace),
      runtime,
      plan: plan.filter((entry) => entry.state !== 'missing'),
    },
    null,
    2,
  ),
)
if (apply) {
  const removed = await applyWorkspaceCleanup(workspace, readRuntime)
  console.log(
    JSON.stringify(
      {
        removed: removed.map((entry) => entry.target.path),
        bytesReleased: removed.reduce((bytes, entry) => bytes + entry.bytes, 0),
        filesRemoved: removed.reduce((files, entry) => files + entry.files, 0),
      },
      null,
      2,
    ),
  )
}
