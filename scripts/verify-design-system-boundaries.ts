import { readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

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
  const violations: DesignSystemViolation[] = []
  for (const match of source.matchAll(/<([a-z][a-z0-9-]*)\b/g)) {
    const element = match[1]
    if (!element || !nativeVisibleElements.has(element)) continue
    violations.push({
      file,
      line: lineAt(source, match.index),
      rule: nativeControls.has(element) ? 'native-control' : 'native-element',
      detail: `Render <${element}> through an @lumen/app-ui component`,
    })
  }
  for (const match of source.matchAll(/\bsize=\{\s*\d+(?:\.\d+)?\s*\}/g))
    violations.push({
      file,
      line: lineAt(source, match.index),
      rule: 'numeric-size',
      detail: 'Use the semantic S/M/L component size',
    })
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

const rendererElements: Readonly<Record<string, readonly string[]>> = {
  'packages/app-react/src/echarts-chart.tsx': ['div'],
  'packages/app-react/src/message-markdown.tsx': ['span'],
}

/** Follow application imports, including public React exports, rather than independent brand reference routes. */
export async function productionDesignSystemFiles(root = process.cwd()): Promise<readonly string[]> {
  const configuration = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile)
  if (configuration.error) throw new Error('Cannot read application TypeScript configuration')
  const raw: unknown = configuration.config
  const parsed = ts.parseJsonConfigFileContent(raw, ts.sys, root)
  const pending = [
    resolve(root, 'apps/web/src/LanguageApp.tsx'),
    resolve(root, 'apps/hbar-app-ui-preview/src/main.tsx'),
  ]
  const visited = new Set<string>()
  const owned = (file: string) =>
    /^(?:apps\/web\/src|packages\/app-react\/src|apps\/hbar-app-ui-preview\/src)\//.test(file) &&
    !file.includes('/react-bits/reference/')
  while (pending.length) {
    const path = pending.pop()
    if (!path || visited.has(path)) continue
    const file = relative(root, path).replaceAll('\\', '/')
    if (!owned(file)) continue
    visited.add(path)
    if (extname(path) === '.css') continue
    const source = await readFile(path, 'utf8')
    const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
    for (const statement of tree.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
      const specifier = statement.moduleSpecifier
      if (
        !specifier ||
        !ts.isStringLiteral(specifier) ||
        (ts.isExportDeclaration(statement) && statement.isTypeOnly) ||
        (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly)
      )
        continue
      const child =
        specifier.text.endsWith('.css') && specifier.text.startsWith('.')
          ? resolve(dirname(path), specifier.text)
          : ts.resolveModuleName(specifier.text, path, parsed.options, ts.sys).resolvedModule?.resolvedFileName
      if (child) pending.push(resolve(child))
    }
    // Lazy production views use the same boundary as static imports.
    const lazy = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = node.arguments[0]
        if (specifier && ts.isStringLiteral(specifier)) {
          const child = ts.resolveModuleName(specifier.text, path, parsed.options, ts.sys).resolvedModule
            ?.resolvedFileName
          if (child) pending.push(resolve(child))
        }
      }
      ts.forEachChild(node, lazy)
    }
    ts.forEachChild(tree, lazy)
  }
  return [...visited].sort()
}

export async function auditProductionDesignSystem(root = process.cwd()): Promise<readonly DesignSystemViolation[]> {
  const violations: DesignSystemViolation[] = []
  for (const file of await productionDesignSystemFiles(root)) {
    const source = await readFile(file, 'utf8')
    const display = relative(root, file).replaceAll('\\', '/')
    violations.push(
      ...(extname(file) === '.css'
        ? auditProductionCss(display, source)
        : extname(file) === '.tsx'
          ? auditProductionTsx(display, source).filter(
              (violation) =>
                !rendererElements[display]?.some(
                  (element) => violation.detail === `Render <${element}> through an @lumen/app-ui component`,
                ),
            )
          : []),
    )
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
