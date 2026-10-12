import { cp, mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

/** Export a self-contained source repository without publishing or touching an existing checkout. */
export async function exportLumenRepository(destination: string): Promise<void> {
  const source = resolve(import.meta.dir, '../packages/lumen-app-ui')
  const target = resolve(destination)
  if (target === source || target.startsWith(source + '/') || target.startsWith(source + '\\'))
    throw new Error('The standalone export must be outside the source package')
  await mkdir(target, { recursive: true })
  if ((await readdir(target)).length) throw new Error('Choose an empty standalone repository directory')
  await cp(source, target, {
    recursive: true,
    filter: (path) => !['node_modules', 'dist', 'artifacts', '.git'].includes(basename(path)),
  })
  await writeFile(join(target, '.gitignore'), 'node_modules/\ndist/\n*.tsbuildinfo\n')
  for (const args of [
    ['init', '--initial-branch=codex/standalone-lumen'],
    ['add', '--', '.'],
    ['commit', '-m', 'chore(lumen): extract standalone licensed source package'],
  ]) {
    const process = Bun.spawn(['git', '-C', target, ...args], {
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true,
    })
    if ((await process.exited) !== 0) throw new Error(`Standalone Git operation failed: ${args[0]}`)
  }
}

if (import.meta.main) {
  const destination = Bun.argv[2]
  if (!destination) throw new Error('Provide an empty destination for the standalone Lumen repository')
  await exportLumenRepository(destination)
}
