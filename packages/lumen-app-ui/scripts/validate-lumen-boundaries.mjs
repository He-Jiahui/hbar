import fs from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import console from 'node:console'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const sourceRoot = path.join(root, 'src')
const allowedMuiFiles = new Set(['LumenProvider.tsx', 'LumenSlider.tsx', 'theme.ts'])
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
const violations = []

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(target)
      continue
    }
    if (
      !sourceExtensions.has(path.extname(entry.name)) ||
      entry.name.endsWith('.d.ts') ||
      /\.(test|spec)\.[jt]sx?$/.test(entry.name)
    ) {
      continue
    }
    const text = fs.readFileSync(target, 'utf8')
    if (/@mui\//.test(text) && !allowedMuiFiles.has(entry.name)) {
      violations.push(path.relative(process.cwd(), target))
    }
  }
}

walk(sourceRoot)

if (violations.length) {
  console.error('Lumen boundary guard failed. MUI imports are only allowed in the base adapters:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exitCode = 1
} else {
  console.log('Lumen boundary guard passed.')
}
