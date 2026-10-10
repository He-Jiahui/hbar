import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'

const root = resolve(import.meta.dir, '..')
const source = resolve(root, 'artifacts/visual-upgrade/screenshots')
const destination = resolve(root, 'apps/hbar-app-ui-preview/public/visual-upgrade')
const captures: { family: string; locale: string; theme: string; width: number; phase: string; src: string }[] = []
function contained(path: string, parent: string): string {
  const child = relative(parent, path)
  if (!child || child.startsWith(`..${sep}`) || child === '..' || resolve(parent, child) !== path)
    throw new Error('Evidence target escapes its owned preview directory')
  return path
}
for (const phase of ['before', 'after']) {
  const phaseRoot = resolve(source, phase)
  for (const directory of await readdir(phaseRoot, { withFileTypes: true })) {
    const match = /^(zh-CN|en-US)-(dark|light)-(320|768|1088|1440|1920)$/.exec(directory.name)
    if (!directory.isDirectory() || !match) continue
    for (const file of await readdir(resolve(phaseRoot, directory.name), { withFileTypes: true })) {
      if (!file.isFile() || !/^[a-z][a-z-]+\.png$/.test(file.name)) continue
      const targetDirectory = contained(resolve(destination, 'screenshots', phase, directory.name), destination)
      await mkdir(targetDirectory, { recursive: true })
      await copyFile(
        resolve(phaseRoot, directory.name, file.name),
        contained(resolve(targetDirectory, file.name), destination),
      )
      captures.push({
        family: file.name.slice(0, -4),
        locale: match[1]!,
        theme: match[2]!,
        width: Number(match[3]),
        phase,
        src: `/visual-upgrade/screenshots/${phase}/${directory.name}/${file.name}`,
      })
    }
  }
}
const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
if (revision.exitCode !== 0) throw new Error('Cannot identify the evidence source revision')
await writeFile(
  resolve(destination, 'index.json'),
  JSON.stringify({ before: '96dee0a9', after: revision.stdout.toString().trim(), captures }, null, 2),
)
console.log(`Published ${captures.length} PNG captures; traces, tokens and service logs stay outside the preview.`)
