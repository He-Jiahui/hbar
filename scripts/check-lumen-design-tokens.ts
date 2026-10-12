import { readFile } from 'node:fs/promises'
import path from 'node:path'
import postcss from 'postcss'
import stylelint from 'stylelint'
import { lumenDesignScaleConfig } from './style-contracts-config'

const packageSource = path.resolve('packages/lumen-app-ui/src')
const workbenchStyles = new Set<string>()
const manifest = await readFile(path.resolve(packageSource, 'workbench-component-styles.ts'), 'utf8')
const pending = [path.resolve(packageSource, 'styles.css')]
for (const [, relativeStylesheet] of manifest.matchAll(/import\s+['"]\.\/([^'"]+\.css)['"]/g)) {
  if (relativeStylesheet) pending.push(path.resolve(packageSource, relativeStylesheet))
}
while (pending.length) {
  const file = pending.pop()!
  if (workbenchStyles.has(file)) continue
  workbenchStyles.add(file)
  const root = postcss.parse(await readFile(file, 'utf8'), { from: file })
  root.walkAtRules('import', (rule) => {
    const specifier = /^['"]([^'"]+)['"]/.exec(rule.params)?.[1]
    if (specifier?.startsWith('.')) pending.push(path.resolve(path.dirname(file), specifier))
  })
}
const files = [...workbenchStyles].filter((file) => file.startsWith(packageSource)).sort()
const result = await stylelint.lint({ files, config: lumenDesignScaleConfig, formatter: 'string' })
if (result.report) console.log(result.report)
if (result.errored) process.exitCode = 1
else console.log(`Lumen design-token contracts passed for ${files.length} public workbench stylesheets.`)
