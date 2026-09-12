const allowlist = new Set([
  'apps/web/src/gallery-theme.css',
  'apps/web/src/react-bits/GlassSurface.tsx',
  'apps/web/src/react-bits/GlassSurface.css',
])
const violations: string[] = []
const staged = Bun.spawnSync(['git', 'diff', '--cached', '--quiet']).exitCode === 1
if (!staged) {
  console.log('Theme token check skipped: no staged web changes.')
  process.exit(0)
}
const diff = Bun.spawnSync(['git', 'diff', '--cached', '--unified=0', '--', 'apps/web/src'])
const changed = new TextDecoder().decode(diff.stdout).split(/\r?\n/)
let currentFile = ''
for (const line of changed) {
  const file = /^diff --git a\/(.+) b\/(.+)$/.exec(line)?.[2]
  if (file) {
    currentFile = file
    continue
  }
  if (!line.startsWith('+') || line.startsWith('+++')) continue
  const display = currentFile.replaceAll('\\', '/')
  if (allowlist.has(display)) continue
  if (/#[0-9a-f]{3,8}\b/i.test(line) || /(?:font-size|font-family)\s*:\s*(?!var\()/i.test(line)) violations.push(display)
}
if (violations.length) {
  console.error(`Theme token violations (${violations.length}):\n${violations.slice(0, 80).join('\n')}`)
  process.exit(1)
}
console.log('Theme token check passed.')
