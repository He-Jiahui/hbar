import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'

const packageSchema = z.object({
  name: z.literal('@hbar/decision-laya'),
  version: z.string().min(1),
  type: z.literal('module'),
  hbar: z.object({
    apiVersion: z.string(),
    scope: z.literal('global'),
    runtimeScope: z.literal('host'),
    host: z.string(),
    permissions: z.array(z.string()),
    activationEvents: z.array(z.string()),
  }),
})

/** Emits a regular-file package without workspace node_modules links or model data. */
export async function packageLaya(destination: string): Promise<string> {
  const repo = resolve(import.meta.dirname, '..')
  const source = resolve(repo, 'plugins/decision-laya')
  const pkg = packageSchema.parse(JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8')) as unknown)
  const output = resolve(destination)
  await mkdir(output, { recursive: true })
  const files = await readdir(output, { withFileTypes: true })
  if (files.length) {
    if (
      files.some((file) => !file.isFile() || !['host.js', 'package.json', 'README.md', 'LICENSE'].includes(file.name))
    )
      throw new Error('Package output directory contains files not owned by the Laya packager')
    const previous = packageSchema.safeParse(
      JSON.parse(await readFile(resolve(output, 'package.json'), 'utf8')) as unknown,
    )
    if (!previous.success) throw new Error('Package output directory contains files not owned by the Laya packager')
  }
  const built = await Bun.build({
    entrypoints: [resolve(source, pkg.hbar.host)],
    outdir: output,
    naming: 'host.js',
    format: 'esm',
    target: 'bun',
    splitting: false,
  })
  if (!built.success) throw new AggregateError(built.logs, 'Laya plugin packaging failed')
  await writeFile(
    resolve(output, 'package.json'),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        type: pkg.type,
        license: 'MIT',
        exports: './host.js',
        hbar: { ...pkg.hbar, host: './host.js' },
      },
      null,
      2,
    ) + '\n',
  )
  await copyFile(resolve(source, 'README.md'), resolve(output, 'README.md'))
  await copyFile(resolve(repo, 'LICENSE'), resolve(output, 'LICENSE'))
  return output
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { output: { type: 'string', default: '.dev/plugin-packages/decision-laya' } },
  })
  console.log(await packageLaya(values.output ?? '.dev/plugin-packages/decision-laya'))
}
