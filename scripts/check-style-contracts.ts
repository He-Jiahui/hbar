import stylelint from 'stylelint'
import { styleContractsConfig } from './style-contracts-config'

const result = await stylelint.lint({
  files: ['apps/web/src/**/*.css', 'packages/app-react/src/**/*.css'],
  config: styleContractsConfig,
  formatter: 'string',
})
if (result.report) console.log(result.report)
const maintainedStylesheets = result.results.filter((entry) => {
  const source = (entry.source ?? '').replaceAll('\\', '/')
  return !source.includes('/react-bits/') && !source.endsWith('/gallery-theme.css')
})
if (result.errored) process.exitCode = 1
else console.log(`Style contracts passed for ${maintainedStylesheets.length} maintained host stylesheets (${result.results.length} files discovered including ignored references).`)
