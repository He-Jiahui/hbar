import * as ts from 'typescript'
import { LUMEN_TEXT_CONTEXTS } from '@lumen/app-ui'
import type { DesktopElement, DesktopElementCategory, DesktopElementStatus } from './types'

const nativeText = new Set([
  'span',
  'p',
  'small',
  'strong',
  'b',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'label',
  'legend',
  'dt',
  'dd',
  'time',
  'output',
  'code',
  'pre',
  'kbd',
  's',
  'bdi',
])
const nativeControls = new Set(['button', 'input', 'select', 'textarea', 'details', 'summary', 'a', 'dialog'])
const categoryByComponent: Readonly<Record<string, DesktopElementCategory>> = {
  LumenFrame: 'structure',
  LumenSurface: 'structure',
  LumenProvider: 'structure',
  LumenAppShell: 'structure',
  LumenAppSidebar: 'structure',
  LumenToolPane: 'structure',
  LumenPageHeader: 'structure',
  LumenContentText: 'text',
  LumenText: 'text',
  LumenCollection: 'collection',
  LumenCollectionItem: 'collection',
  LumenTree: 'collection',
  LumenTreeItem: 'collection',
  LumenInput: 'form',
  LumenTextarea: 'form',
  LumenFormField: 'form',
  LumenCheckBox: 'form',
  LumenCheckBoxControl: 'form',
  LumenToggle: 'form',
  LumenToggleControl: 'form',
  LumenPopupSelect: 'form',
  LumenComboBox: 'form',
  LumenMultiSelect: 'form',
  LumenRange: 'form',
  LumenToggleGroup: 'form',
  LumenButton: 'interaction',
  LumenIconButton: 'interaction',
  LumenIcon: 'interaction',
  LumenLink: 'interaction',
  LumenDialog: 'interaction',
  LumenFloatingSurface: 'interaction',
  FloatingSurface: 'interaction',
  LumenActionMenu: 'interaction',
  LumenNavigationButton: 'interaction',
  LumenDisclosure: 'interaction',
  LumenWindowTitlebar: 'platform',
  LumenStatus: 'feedback',
  LumenIndicator: 'feedback',
  LumenWorkbenchNotice: 'feedback',
  LumenCompactMetrics: 'collection',
  LumenBarSeries: 'collection',
  LumenImage: 'technical',
}

export const desktopRendererBoundaries: Readonly<Record<string, readonly string[]>> = {
  'packages/app-react/src/message-markdown.tsx': ['InlineContainer', 'InlineLink', 'InlineImage'],
  'packages/app-react/src/goal-lifecycle.tsx': ['renderFragments'],
}

function ownerOf(node: ts.Node, source: ts.SourceFile): string {
  let parent: ts.Node | undefined = node
  while (parent) {
    if ((ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent)) && parent.name) return parent.name.text
    if (
      ts.isVariableDeclaration(parent) &&
      parent.initializer &&
      (ts.isArrowFunction(parent.initializer) || ts.isFunctionExpression(parent.initializer))
    )
      return parent.name.getText(source)
    parent = parent.parent
  }
  return 'module'
}

function attributeValue(attribute: ts.JsxAttribute, source: ts.SourceFile): string {
  const value = attribute.initializer
  if (!value) return 'true'
  if (ts.isStringLiteral(value)) return value.text
  if (ts.isJsxExpression(value)) return value.expression ? expressionSource(value.expression, source) : ''
  return value.getText(source)
}

function expressionSource(node: ts.Node, source: ts.SourceFile): string {
  const text = node.getText(source)
  if (text.length <= 600) return text
  const references = new Set<string>()
  function inspect(value: ts.Node): void {
    if (ts.isJsxElement(value) || ts.isJsxSelfClosingElement(value) || ts.isJsxFragment(value)) return
    if (ts.isPropertyAccessExpression(value)) references.add(value.getText(source))
    if (ts.isIdentifier(value) && !ts.isPropertyAccessExpression(value.parent)) references.add(value.text)
    ts.forEachChild(value, inspect)
  }
  inspect(node)
  return `[source:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}; ${ts.SyntaxKind[node.kind]}] ${[...references].join(', ')}`
}

function composedContent(node: ts.Expression, checker?: ts.TypeChecker, visited = new Set<ts.Node>()): boolean {
  if (visited.has(node)) return false
  visited.add(node)
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true
  if (ts.isParenthesizedExpression(node)) return composedContent(node.expression, checker, visited)
  if (
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.TrueKeyword
  )
    return true
  if (ts.isIdentifier(node) && node.text === 'undefined') return true
  if (checker) {
    if (composedType(checker.getTypeAtLocation(node), checker)) return true
    const symbol = checker.getSymbolAtLocation(node)
    const declaration = symbol?.valueDeclaration
    if (symbol && declaration) {
      if (composedType(checker.getTypeOfSymbolAtLocation(symbol, declaration), checker)) return true
      if (ts.isVariableDeclaration(declaration) && declaration.initializer)
        return composedContent(declaration.initializer, checker, visited)
    }
  }
  if (ts.isConditionalExpression(node))
    return composedContent(node.whenTrue, checker, visited) && composedContent(node.whenFalse, checker, visited)
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
    return composedContent(node.right, checker, visited)
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'map'
  ) {
    const fn = node.arguments[0]
    if (fn && ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return composedContent(fn.body, checker, visited)
  }
  return false
}

/** Typed React slots remain composition boundaries; plain strings/numbers require a purpose. */
function composedType(type: ts.Type, checker: ts.TypeChecker): boolean {
  const name = type.aliasSymbol?.getName() ?? type.getSymbol()?.getName()
  if (name === 'ReactNode' || name === 'ReactElement' || name === 'ReactPortal') return true
  if (
    name === 'Element' &&
    type
      .getSymbol()
      ?.declarations?.some(
        (node) =>
          node.parent.parent && ts.isModuleDeclaration(node.parent.parent) && node.parent.parent.name.text === 'JSX',
      )
  )
    return true
  if (type.isUnion()) return type.types.every((item) => composedType(item, checker))
  if (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.BooleanLike | ts.TypeFlags.Never))
    return true
  if (checker.isArrayType(type) || checker.isTupleType(type))
    return checker.getTypeArguments(type as ts.TypeReference).every((item) => composedType(item, checker))
  return false
}

function surfaceOf(path: string, owner: string): string {
  const value = `${path}/${owner}`.toLowerCase()
  if (/settings|provider|sandbox|extension|skill-import|storage-location/.test(value)) return 'settings'
  if (/file-|markdown|code-|diff|image/.test(value)) return 'files-and-reading'
  if (/activity|workflow|run-board|agent-/.test(value)) return 'agents-and-activity'
  if (/goal|plan/.test(value)) return 'goals-and-plans'
  if (/usage|status|monitoring|diagnostic/.test(value)) return 'status-and-usage'
  if (/schedule|notification|template|onboarding/.test(value)) return 'global-pages'
  if (/composer|pre-session|prompt/.test(value)) return 'composer-and-launch'
  if (/session|message|chat|conversation/.test(value)) return 'session'
  if (/palette|command/.test(value)) return 'commands'
  return 'workbench'
}

function categoryOf(component: string, attributes: Readonly<Record<string, string>>): DesktopElementCategory {
  const declared = categoryByComponent[component]
  if (declared) return declared
  if (nativeControls.has(component)) return 'interaction'
  if (nativeText.has(component)) return 'text'
  if (/Image|Markdown|Code|FileDocument|Diff|Diagram|Chart|Echarts/.test(component)) return 'technical'
  if (/Feedback|Notice|Status|Readiness|Skeleton|Timing|Progress|Empty/.test(component)) return 'feedback'
  if (/Form|Setting|Editor|Picker|Input|Composer|Questionnaire/.test(component)) return 'form'
  if (/Tree|List|Collection|Metric|Usage|Table|Timeline|Board|Scheduling/.test(component)) return 'collection'
  if (/Button|Menu|Dialog|Tabs|Action|Select|Disclosure|Decision|Approval|Search/.test(component)) return 'interaction'
  if (attributes.role === 'alert' || attributes.role === 'status') return 'feedback'
  return 'structure'
}

function nativeMapping(component: string): string {
  if (nativeText.has(component)) return 'LumenContentText: explicit content context required'
  if (component === 'button') return 'LumenButton/LumenIconButton'
  if (component === 'input') return 'registered Lumen input/checkbox/switch'
  if (component === 'textarea') return 'LumenTextarea'
  if (component === 'select' || component === 'option') return 'LumenPopupSelect/LumenOption'
  if (component === 'a') return 'LumenLink or typed navigation renderer'
  if (component === 'details' || component === 'summary') return 'LumenDisclosure'
  if (component === 'dialog') return 'LumenDialog/FloatingSurface'
  if (/^(ul|ol|dl|table|thead|tbody|tfoot)$/.test(component)) return 'LumenCollection'
  if (/^(li|tr|th|td)$/.test(component)) return 'LumenCollectionItem'
  return 'LumenFrame or dedicated renderer'
}

export function classifyDesktopSource(
  path: string,
  source: ts.SourceFile,
  checker?: ts.TypeChecker,
): readonly DesktopElement[] {
  const records: DesktopElement[] = []
  const ordinals = new Map<string, number>()
  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const component = node.tagName.getText(source)
      const owner = ownerOf(node, source)
      const attributes: Record<string, string> = {}
      for (const attribute of node.attributes.properties)
        if (ts.isJsxAttribute(attribute)) attributes[attribute.name.getText(source)] = attributeValue(attribute, source)
      const children = ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent) ? node.parent.children : []
      const contentSources = children.flatMap((child) =>
        ts.isJsxExpression(child) && child.expression
          ? [expressionSource(child.expression, source)]
          : ts.isJsxText(child) && child.text.trim()
            ? [`literal:${child.text.trim()}`]
            : [],
      )
      for (const [name, value] of Object.entries(attributes))
        if (/^(title|description|label|labels|content|value|placeholder|empty|items|rows|options|nodes)$/.test(name))
          contentSources.push(`${name}=${value}`)
      const context = component === 'LumenContentText' ? (attributes.context ?? null) : null
      const definition = context
        ? Object.entries(LUMEN_TEXT_CONTEXTS).find(([name]) => name === context)?.[1]
        : undefined
      const native = /^[a-z]/.test(component) && !component.includes('.')
      const renderer = desktopRendererBoundaries[path]?.some((name) => name === '*' || name === owner) ?? false
      const schema = path.startsWith('packages/schema-react/')
      let status: DesktopElementStatus = schema
        ? 'schema-boundary'
        : renderer && native
          ? 'renderer-boundary'
          : component === 'LumenText' || native
            ? 'pending'
            : context
              ? 'semantic'
              : 'composed'
      const issues: string[] = []
      if (component === 'LumenText') issues.push('text-purpose-not-declared')
      if (native && !renderer && !schema) issues.push('native-element-outside-renderer')
      if (context && !definition) {
        status = 'pending'
        issues.push('unknown-text-context')
      }
      if (contentSources.some((value) => value.startsWith('literal:')) && !renderer && !schema)
        issues.push('literal-visible-content')
      if (!renderer && !schema) {
        for (const attribute of node.attributes.properties) {
          if (
            ts.isJsxAttribute(attribute) &&
            /^(aria-label|title|alt|placeholder|label)$/.test(attribute.name.getText(source)) &&
            attribute.initializer &&
            ts.isStringLiteral(attribute.initializer) &&
            attribute.initializer.text.trim()
          )
            issues.push('literal-accessible-content')
        }
      }
      if (issues.includes('literal-visible-content') || issues.includes('literal-accessible-content'))
        status = 'pending'
      const rawFrameContent =
        component === 'LumenFrame' &&
        children.some((child) =>
          ts.isJsxText(child)
            ? Boolean(child.text.trim())
            : ts.isJsxExpression(child) && child.expression
              ? !composedContent(child.expression, checker)
              : false,
        )
      if (rawFrameContent && !renderer) {
        status = 'pending'
        issues.push('container-owns-unclassified-content')
      }
      const category = categoryOf(component, attributes)
      const key = `${path}::${owner}::${component}`
      const ordinal = (ordinals.get(key) ?? 0) + 1
      ordinals.set(key, ordinal)
      records.push({
        id: `${key}::${ordinal}`,
        path,
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        owner,
        surface: surfaceOf(path, owner),
        component,
        category,
        context,
        contentSources,
        accessibleNameSources: Object.entries(attributes)
          .filter(([name]) => /^(aria-label|aria-labelledby|aria-describedby|label|title|alt)$/.test(name))
          .map(([name, value]) => `${name}=${value}`),
        actionBindings: Object.fromEntries(Object.entries(attributes).filter(([name]) => /^on[A-Z]/.test(name))),
        targetSources: Object.entries(attributes)
          .filter(([name]) => /(?:Id|^id$|key|target|reference|session|workspace|field)/i.test(name))
          .map(([name, value]) => `${name}=${value}`),
        stateSources: Object.entries(attributes)
          .filter(([name]) =>
            /^(status|state|selected|active|checked|disabled|loading|busy|error|value|open|expanded|connected|aria-busy|aria-selected|aria-expanded)$/.test(
              name,
            ),
          )
          .map(([name, value]) => `${name}=${value}`),
        flow:
          definition?.flow ??
          (category === 'collection'
            ? 'owning component defines bound, paging and scroll'
            : category === 'technical'
              ? 'dedicated renderer preserves original content'
              : category === 'structure'
                ? 'owning flow layout'
                : 'owning component contract'),
        lumenMapping: native
          ? nativeMapping(component)
          : component === 'LumenText'
            ? 'LumenContentText: explicit context required'
            : component,
        status,
        issues,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return records
}
