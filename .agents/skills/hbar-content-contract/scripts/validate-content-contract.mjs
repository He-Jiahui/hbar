/* global Bun, console, process */

import ts from 'typescript'

const visibleAttributes = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-roledescription',
  'aria-valuetext',
  'placeholder',
  'title',
])

function sourcePosition(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return `${position.line + 1}:${position.character + 1}`
}

function stringExpression(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
}

function report(errors, sourceFile, node, message) {
  errors.push(`${sourceFile.fileName}:${sourcePosition(sourceFile, node)}: ${message}`)
}

function inspectRenderedExpression(expression, sourceFile, errors) {
  if (!expression) return
  if (stringExpression(expression)) {
    report(errors, sourceFile, expression, 'visible copy must come from a typed labels/data prop, not a string literal.')
    return
  }
  if (ts.isConditionalExpression(expression)) {
    inspectRenderedExpression(expression.whenTrue, sourceFile, errors)
    inspectRenderedExpression(expression.whenFalse, sourceFile, errors)
    return
  }
  if (ts.isParenthesizedExpression(expression)) {
    inspectRenderedExpression(expression.expression, sourceFile, errors)
    return
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    inspectRenderedExpression(expression.left, sourceFile, errors)
    inspectRenderedExpression(expression.right, sourceFile, errors)
  }
}

function attributeName(attribute) {
  return ts.isIdentifier(attribute.name) ? attribute.name.text : attribute.name.getText()
}

function validateTsx(path, source) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const errors = []

  function visit(node) {
    if (ts.isJsxText(node) && node.getText(sourceFile).trim()) {
      report(errors, sourceFile, node, 'visible JSX text must come from a typed labels/data prop, not a string literal.')
    }

    if (ts.isJsxAttribute(node) && visibleAttributes.has(attributeName(node))) {
      const initializer = node.initializer
      if (initializer && ts.isStringLiteral(initializer) && initializer.text.trim()) {
        report(errors, sourceFile, initializer, `${attributeName(node)} must come from a typed labels/data prop, not a string literal.`)
      }
      if (initializer && ts.isJsxExpression(initializer)) {
        inspectRenderedExpression(initializer.expression, sourceFile, errors)
      }
    }

    // JSX expressions used as children render copy; expressions inside ordinary
    // props often carry technical values such as class names and must not be
    // mistaken for user-visible text.
    if (
      ts.isJsxExpression(node) &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      inspectRenderedExpression(node.expression, sourceFile, errors)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return errors
}

function selfTest() {
  const good = `
    type Labels = { readonly close: string }
    export function Panel({active, labels}: { readonly active: boolean; readonly labels: Labels }) {
      return <button className={active ? 'is-active' : 'is-idle'} aria-label={labels.close}>{labels.close}</button>
    }
  `
  const bad = `
    export function Panel() {
      return <button aria-label="Close">{true ? 'Close' : 'Dismiss'}</button>
    }
  `
  const goodErrors = validateTsx('good.tsx', good)
  const badErrors = validateTsx('bad.tsx', bad)
  if (goodErrors.length !== 0 || badErrors.length < 3) {
    console.error('Content contract self-test failed.')
    process.exit(1)
  }
  console.log('Content contract self-test passed.')
}

const inputPaths = Bun.argv.slice(2).filter((path) => path !== '--self-test')
if (Bun.argv.includes('--self-test')) {
  selfTest()
  if (inputPaths.length === 0) process.exit(0)
}

if (inputPaths.length === 0) {
  console.error('Usage: bun validate-content-contract.mjs <tsx-file> [...tsx-file]')
  process.exit(1)
}

const allErrors = []
for (const path of inputPaths) {
  if (!path.endsWith('.tsx')) continue
  const file = Bun.file(path)
  if (!await file.exists()) {
    allErrors.push(`${path}: file does not exist`)
    continue
  }
  allErrors.push(...validateTsx(path, await file.text()))
}

if (allErrors.length > 0) {
  console.error(allErrors.join('\n'))
  process.exit(1)
}

console.log(`Content contract guard passed for ${inputPaths.length} file(s).`)
