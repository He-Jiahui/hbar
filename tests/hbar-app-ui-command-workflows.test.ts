import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarAppUiSearchCommands,
  HbarAppUiInviteCommand,
  HbarAppUiAssistantCommands,
  type HbarAppUiCommandListProps,
} from '../packages/hbar-app-ui/src/command-menu'
import { COMMAND_LABELS } from './fixtures/hbar-app-ui-command-fixtures'
import {
  SEARCH_COMMANDS,
  SEARCH_SCOPES,
  INVITE_FIXTURE,
  ASSISTANT_FIXTURE,
} from './fixtures/hbar-app-ui-command-workflow-fixtures'

test('removed search selection never renders an actionable stale detail', () => {
  const list: HbarAppUiCommandListProps = {
    labels: COMMAND_LABELS,
    items: SEARCH_COMMANDS,
    query: '',
    selectedId: 'missing',
    selectionLost: true,
    onQueryChange() {},
    onSelect() {},
    onMove() {},
    onExecute() {},
    listStrategy: 'content-grown',
    error: undefined,
  }
  const html = renderToStaticMarkup(
    createElement(HbarAppUiSearchCommands, {
      list,
      scopes: SEARCH_SCOPES,
      scopeId: 'all',
      scopeLabel: '搜索范围',
      onScopeChange() {},
      missingDetail: '选择已失效',
      onOpenResult() {},
      detail: {
        id: SEARCH_COMMANDS[0]!.id,
        title: 'Stale detail',
        kind: 'DOC',
        description: 'old',
        fields: [],
        body: 'old body',
        openLabel: 'Open stale',
        busy: false,
      },
    }),
  )
  expect(html).toContain('选择已失效')
  expect(html).not.toContain('Open stale')
  expect(html).not.toContain('Stale detail')
})
test('invite state and errors come from host; a removed role cannot be reviewed', () => {
  const html = renderToStaticMarkup(
    createElement(HbarAppUiInviteCommand, {
      labels: { ...INVITE_FIXTURE.labels, email: '电子邮件地址'.repeat(8) },
      email: 'person@example.test',
      roleId: 'deleted',
      roles: [...INVITE_FIXTURE.roles, INVITE_FIXTURE.roles[0]!],
      busy: false,
      canReview: true,
      error: '邀请失败，保留输入',
      onBack() {},
      onEmailChange() {},
      onRoleChange() {},
      onReview() {},
    }),
  )
  expect(html.match(/<option/g)).toHaveLength(INVITE_FIXTURE.roles.length + 1)
  expect(html).toContain('value="" disabled="" selected=""')
  expect(html).toContain('role="alert">邀请失败，保留输入')
  expect(html).toContain('value="person@example.test"')
  expect(html).toContain('disabled=""')
})
test('assistant renders empty and duplicate suggestion sets without inventing commands', () => {
  const content = {
    labels: { ...ASSISTANT_FIXTURE.labels, title: '没有匹配命令' },
    query: '宿主问题',
    suggestions: [],
    busy: true,
    canAsk: true,
    error: undefined,
    onQueryChange() {},
    onAsk() {},
    onSuggestion() {},
  }
  const empty = renderToStaticMarkup(createElement(HbarAppUiAssistantCommands, content))
  expect(empty).not.toContain('Billing settings')
  expect(empty).toContain('宿主问题')
  const html = renderToStaticMarkup(
    createElement(HbarAppUiAssistantCommands, {
      ...content,
      suggestions: [
        { id: 'same', label: '旧建议' },
        { id: 'same', label: '新建议' },
      ],
    }),
  )
  expect(html).toContain('新建议')
  expect(html).not.toContain('旧建议')
})
