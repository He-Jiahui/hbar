import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import * as ts from 'typescript'
import { classifyDesktopSource } from './desktop-element-audit/classify'
import { loadDesktopSourceGraph } from './desktop-element-audit/graph'

export interface DesignSystemViolation {
  readonly file: string
  readonly line: number
  readonly rule: 'native-control' | 'native-element' | 'numeric-size' | 'primitive-style' | 'primitive-state-style'
  readonly detail: string
}

const primitiveSelector = /\.hbar-app-ui-(?:button|icon-button|control|label|text)(?![A-Za-z0-9_-])/
const forbiddenPrimitiveProperty =
  /(?:^|;)\s*(?:font(?:-size|-family)?|line-height|min-block-size|block-size|height|border(?:-[\w-]+)?|background(?:-[\w-]+)?|color|padding(?:-[\w-]+)?|outline(?:-[\w-]+)?|box-shadow)\s*:/m
const forbiddenPrimitiveState = /:(?:hover|focus|focus-visible|disabled)\b/
const nativeControls = new Set(['button', 'input', 'select', 'textarea'])
const nativeVisibleElements = new Set([
  'a',
  'article',
  'aside',
  'b',
  'blockquote',
  'button',
  'canvas',
  'code',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'em',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'i',
  'iframe',
  'img',
  'input',
  'kbd',
  'label',
  'legend',
  'li',
  'main',
  'mark',
  'nav',
  'ol',
  'option',
  'output',
  'p',
  'picture',
  'pre',
  's',
  'section',
  'select',
  'small',
  'span',
  'strong',
  'summary',
  'table',
  'tbody',
  'td',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'ul',
  'video',
])

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length
}

export function auditProductionTsx(file: string, source: string): readonly DesignSystemViolation[] {
  const syntax = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const violations: DesignSystemViolation[] = []
  for (const element of classifyDesktopSource(file.replaceAll('\\', '/'), syntax)) {
    if (!nativeVisibleElements.has(element.component) || !element.issues.includes('native-element-outside-renderer'))
      continue
    violations.push({
      file,
      line: element.line,
      rule: nativeControls.has(element.component) ? 'native-control' : 'native-element',
      detail: `Render <${element.component}> through an @lumen/app-ui component`,
    })
  }
  function visit(node: ts.Node): void {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(syntax) === 'size' &&
      node.initializer &&
      ts.isJsxExpression(node.initializer)
    ) {
      const value = node.initializer.expression
      if (
        value &&
        (ts.isNumericLiteral(value) || (ts.isPrefixUnaryExpression(value) && ts.isNumericLiteral(value.operand)))
      ) {
        violations.push({
          file,
          line: syntax.getLineAndCharacterOfPosition(node.getStart(syntax)).line + 1,
          rule: 'numeric-size',
          detail: 'Use the component semantic size tier',
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(syntax)
  return violations
}

export function auditProductionCss(file: string, source: string): readonly DesignSystemViolation[] {
  const violations: DesignSystemViolation[] = []
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1] ?? ''
    const declarations = match[2] ?? ''
    if (!primitiveSelector.test(selector)) continue
    if (forbiddenPrimitiveState.test(selector))
      violations.push({
        file,
        line: lineAt(source, match.index),
        rule: 'primitive-state-style',
        detail: `State styling belongs to hbar-app-ui: ${selector.trim()}`,
      })
    if (forbiddenPrimitiveProperty.test(declarations))
      violations.push({
        file,
        line: lineAt(source, match.index),
        rule: 'primitive-style',
        detail: `Visual primitive styling belongs to hbar-app-ui: ${selector.trim()}`,
      })
  }
  return violations
}

async function sourceFiles(directory: string): Promise<readonly string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)))
    else if (entry.isFile() && ['.css', '.ts', '.tsx'].includes(extname(entry.name))) files.push(path)
  }
  return files
}

function desktopSourceInputs(root: string): ReadonlySet<string> {
  return new Set(
    [...loadDesktopSourceGraph(root).sources.keys()].map((file) => relative(root, file).replaceAll('\\', '/')),
  )
}

/** Runtime imports and demanded barrel exports, plus the maintained application composition package. */
export async function collectProductionAppSourceFiles(root = process.cwd()): Promise<readonly string[]> {
  const inputs = desktopSourceInputs(root)
  const application = await sourceFiles(resolve(root, 'packages/app-react/src'))
  const host = await sourceFiles(resolve(root, 'apps/web/src'))
  return [...application, ...host.filter((file) => inputs.has(relative(root, file).replaceAll('\\', '/')))]
    .filter((file) => ['.ts', '.tsx'].includes(extname(file)))
    .sort()
}

export async function auditProductionDesignSystem(root = process.cwd()): Promise<readonly DesignSystemViolation[]> {
  const violations: DesignSystemViolation[] = []
  const inputs = desktopSourceInputs(root)
  for (const directory of [
    'packages/app-react/src',
    'apps/web/src',
    'packages/hbar-app-ui/src',
    'apps/hbar-app-ui-preview/src',
  ]) {
    for (const file of await sourceFiles(resolve(root, directory))) {
      const display = relative(root, file).replaceAll('\\', '/')
      if (directory === 'apps/web/src' && extname(file) === '.tsx' && !inputs.has(display)) continue
      const source = await readFile(file, 'utf8')
      violations.push(
        ...(extname(file) === '.css' && !directory.startsWith('packages/hbar-app-ui')
          ? auditProductionCss(display, source)
          : extname(file) === '.tsx'
            ? auditProductionTsx(display, source)
            : []),
      )
    }
  }
  return violations
}

if (import.meta.main) {
  const violations = await auditProductionDesignSystem()
  if (violations.length > 0) {
    for (const violation of violations)
      console.error(`${violation.file}:${violation.line} [${violation.rule}] ${violation.detail}`)
    process.exitCode = 1
  } else {
    console.log('Production design-system boundary guard passed.')
  }
}
