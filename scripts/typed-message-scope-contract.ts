import ts from 'typescript'

export interface TypedMessageScopeViolation {
  readonly file: string
  readonly line: number
  readonly rule: 'legacy-label-context' | 'legacy-labels-scope-forwarded' | 'legacy-copy-group-alias'
  readonly detail: string
}

/** Detects legacy copy contexts and whole-contract aliases that restore copy prop drilling. */
export function findTypedMessageScopeViolations(file: string, source: string): TypedMessageScopeViolation[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const violations: TypedMessageScopeViolation[] = []
  const translatedObjects = new Map<ts.Node, Map<string, { readonly key: string; readonly position: ts.Node }>>()
  const topLevelTranslatedObjects = new Set<string>()
  const addViolation = (node: ts.Node, rule: TypedMessageScopeViolation['rule'], detail: string) => {
    violations.push({
      file,
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      rule,
      detail,
    })
  }

  const findAliases = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 't'
    ) {
      let scope: ts.Node = node
      while (
        !ts.isFunctionDeclaration(scope) &&
        !ts.isFunctionExpression(scope) &&
        !ts.isArrowFunction(scope) &&
        scope.parent
      ) {
        scope = scope.parent
      }
      if (scope === sourceFile) topLevelTranslatedObjects.add(node.name.text)
      else {
        const aliases =
          translatedObjects.get(scope) ?? new Map<string, { readonly key: string; readonly position: ts.Node }>()
        const messageKey = node.initializer.arguments[0]
        aliases.set(node.name.text, {
          key: messageKey && ts.isStringLiteralLike(messageKey) ? messageKey.text : '',
          position: node,
        })
        translatedObjects.set(scope, aliases)
      }
    }
    ts.forEachChild(node, findAliases)
  }
  findAliases(sourceFile)

  const inspect = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'createContext' &&
      node.typeArguments?.some((type) => /Labels\b/.test(type.getText(sourceFile)))
    ) {
      addViolation(node, 'legacy-label-context', 'Use a typed message scope instead of a Labels context.')
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'labels' &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 't' &&
      node.initializer.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.initializer.arguments[0]) &&
      node.initializer.arguments[0].text === 'copy'
    ) {
      addViolation(
        node,
        'legacy-copy-group-alias',
        "Do not rename t('copy') to `labels`; render with typed t() keys or semantic groups.",
      )
    }

    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === 'labels' && node.initializer) {
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined
      let scope: ts.Node | undefined = node.parent
      let match: { readonly key: string; readonly position: ts.Node } | undefined
      while (scope && scope !== sourceFile) {
        if (
          (ts.isFunctionDeclaration(scope) || ts.isFunctionExpression(scope) || ts.isArrowFunction(scope)) &&
          value &&
          ts.isIdentifier(value)
        ) {
          match = translatedObjects.get(scope)?.get(value.text)
          if (match) break
        }
        scope = scope.parent
      }
      if (value && ts.isIdentifier(value)) {
        const topLevel = topLevelTranslatedObjects.has(value.text)
        if (match && ['labels', 'scope', 'copy'].includes(match.key)) {
          addViolation(
            node,
            'legacy-labels-scope-forwarded',
            `Do not wrap the whole legacy labels contract in t('${match.key}') and forward it.`,
          )
        } else if (topLevel && ['labels', 'scope'].includes(value.text)) {
          addViolation(
            node,
            'legacy-labels-scope-forwarded',
            'Do not forward an untyped top-level labels or scope message object as labels.',
          )
        }
      }
    }

    ts.forEachChild(node, inspect)
  }
  inspect(sourceFile)
  return violations
}
