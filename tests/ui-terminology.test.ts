import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'bun:test'
import ts from 'typescript'
import type { ComposerBlockedReason } from '@hbar/app-runtime'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { translate } from '../apps/web/src/locale'

const copyDirectory = resolve(process.cwd(), 'apps/web/src')
const chineseText = /[\u3400-\u9fff]/
const untranslatedTerms = /\b(?:Host|Agent|Run|Token)\b/gi
const blockedReasons = [
  'disconnected',
  'first-send',
  'workspace-move',
  'history',
  'execution-unavailable',
  'draft-pending',
  'model-pending',
  'intent-pending',
  'permission',
  'plan-pending',
  'uploading',
  'model-required',
  'empty',
  'run-active',
  'compacting',
  'goal-pending',
] as const satisfies readonly ComposerBlockedReason[]

function localizedTextLiterals(source: string, fileName: string): string[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const englishLocaleBoundary = source.indexOf("'en-US':")
  const values: string[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const parent = node.parent
      const isFirstChoice =
        ts.isCallExpression(parent) &&
        parent.arguments[0] === node &&
        ts.isIdentifier(parent.expression) &&
        (parent.expression.text === 'choose' || parent.expression.text === 'text')
      const isChineseLocaleMap = fileName.endsWith('locale.ts') && node.getStart(sourceFile) < englishLocaleBoundary
      if (chineseText.test(node.text) || isFirstChoice || isChineseLocaleMap) values.push(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return values
}

describe('Chinese workbench terminology', () => {
  it('translates visible Host, Run, Agent and model-token copy while preserving English', () => {
    const chinese = getShellCopy('zh-CN')
    const english = getShellCopy('en-US')

    expect(chinese.session.runs.title).toBe('代理活动')
    expect(chinese.session.approval.title).toBe('代理审批')
    expect(chinese.session.questionnaire.title).toBe('代理问题')
    expect(english.session.runs.title).toBe('Agent activity')
    expect(english.session.approval.title).toBe('Agent approval')
    expect(chinese.session.tools.noticeDetails.title).toBe('其他会话提示')
    expect(english.session.tools.noticeDetails.title).toBe('Other session notices')
    expect(chinese.session.tools.noticeDetails.summary(3)).toBe('3 条其他会话提示，查看详情')
    expect(english.session.tools.noticeDetails.summary(1)).toBe('1 other session notice. View details')

    expect(translate('zh-CN', 'host')).toBe('宿主')
    expect(translate('zh-CN', 'run')).toBe('运行')
    expect(translate('zh-CN', 'inputTokens')).toBe('输入词元')
    expect(translate('zh-CN', 'chatTokens')).toBe('词元')
    expect(translate('zh-CN', 'noThemeTokenOverrides')).toBe('没有主题令牌覆盖')
    expect(translate('en-US', 'host')).toBe('Host')
    expect(translate('en-US', 'run')).toBe('Run')
  })

  it('provides a localized reason for each composer submission block', () => {
    for (const locale of ['zh-CN', 'en-US'] as const) {
      const labels = getShellCopy(locale).session.composerFeedback
      for (const reason of blockedReasons) {
        const message = labels.blockedReason(reason)
        expect(message.length).toBeGreaterThan(0)
        expect(locale === 'zh-CN' ? chineseText.test(message) : message.split('').every((character) => character.charCodeAt(0) < 128)).toBe(true)
      }
    }
  })

  it('keeps untranslated product terms out of Chinese copy literals except executable /agent commands', () => {
    const files = readdirSync(copyDirectory).filter(
      (fileName) => fileName.endsWith('-copy.ts') || fileName === 'shell-copy.ts' || fileName === 'locale.ts',
    )
    const violations: string[] = []

    for (const fileName of files) {
      const filePath = join(copyDirectory, fileName)
      const contents = readFileSync(filePath, 'utf8')
      for (const literal of localizedTextLiterals(contents, filePath)) {
        if (!chineseText.test(literal)) continue
        const userText = literal.replace(/\/agent\b/gi, '')
        if (untranslatedTerms.test(userText)) violations.push(fileName + ': ' + literal)
        untranslatedTerms.lastIndex = 0
      }
    }

    expect(violations).toEqual([])
  })
})
