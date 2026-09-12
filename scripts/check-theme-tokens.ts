const allowlist = new Set([
  'apps/web/src/gallery-theme.css',
  'apps/web/src/react-bits/GlassSurface.tsx',
  'apps/web/src/react-bits/GlassSurface.css',
])
const violations: string[] = []
const seen = new Set<string>()
const staged = Bun.spawnSync(['git', 'diff', '--cached', '--quiet']).exitCode === 1
const diff = Bun.spawnSync(staged
  ? ['git', 'diff', '--cached', '--unified=0', '--', 'apps/web/src']
  : ['git', 'diff', 'HEAD^', 'HEAD', '--unified=0', '--', 'apps/web/src'])
const lines = new TextDecoder().decode(diff.stdout).split(/\r?\n/)
let currentFile = ''
for (const line of lines) {
  const file = /^diff --git a\/(.+) b\/(.+)$/.exec(line)?.[2]
  if (file) {
    currentFile = file
    continue
  }
  if (!line.startsWith('+') || line.startsWith('+++')) continue
  const display = currentFile.replaceAll('\\', '/')
  if (allowlist.has(display)) continue
  const cssLiteral = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\s*\(/i.test(line)
  const cssTypography = /(?:font-size|font-family)\s*:\s*(?!var\()/i.test(line)
  const inlineTypography = /\b(?:fontSize|fontFamily)\s*:/.test(line) && !/var\(--/.test(line)
  if ((cssLiteral || cssTypography || inlineTypography) && !seen.has(display)) {
    seen.add(display)
    violations.push(display)
  }
}
if (violations.length) {
  console.error(`Theme token violations (${violations.length}):\n${violations.slice(0, 80).join('\n')}`)
  process.exit(1)
}
console.log('Theme token check passed.')
