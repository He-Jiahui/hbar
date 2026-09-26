import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiNotificationsProvider,
  selectHbarAppUiNotificationsItem,
  uniqueHbarAppUiNotificationsItems,
  type HbarAppUiNotificationsContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiNotificationActivityFixture,
  createHbarAppUiNotificationPreferencesFixture,
  createHbarAppUiNotificationSystemFixture,
  createHbarAppUiNotificationsLocalizedFixtures,
  HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
} from './fixtures/hbar-app-ui-notifications-fixtures'

function render(variant: number, content: HbarAppUiNotificationsContent = HBAR_APP_UI_NOTIFICATIONS_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiNotificationsProvider, {
      content,
      children: createElement(getHbarAppUiVariant('notifications', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui notification surfaces', () => {
  test('renders six distinct Lumen notification workflows from host content', () => {
    const values = Array.from({ length: 6 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(6)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="notifications"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiNotificationsLocalizedFixtures())
    expect(value).toContain('通知')
    expect(value).toContain('今天')
    expect(value).not.toContain('Notifications')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiNotificationsItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiNotificationsItem(items, 'missing')).toBe(items[0])
  })

  test('honors empty feeds and explicit capacity strategies', () => {
    const content: HbarAppUiNotificationsContent = {
      ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
      center: { ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES.center!, entries: [] },
      system: { ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES.system!, messages: [] },
    }
    expect(render(1, content)).toContain('No notifications')
    expect(render(5, content)).toContain('No messages')
    expect(render(1)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(render(6)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
  })

  test('keeps notification groups, counts and action labels host-owned at capacity', () => {
    const reference = HBAR_APP_UI_NOTIFICATIONS_FIXTURES.center!
    const content: HbarAppUiNotificationsContent = {
      ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
      center: {
        ...reference,
        entries: Array.from({ length: 80 }, (_, index) => ({
          id: `event-${index}`,
          groupId: index < 40 ? 'today' : 'yesterday',
          kind: 'Mention',
          title: `通知事件 ${index} — ${'长标题'.repeat(30)}`,
          detail: '详情'.repeat(60),
          time: `${index} 分钟`,
          unread: index % 2 === 0,
          mention: index % 4 === 0,
        })),
        labels: {
          ...reference.labels,
          title: '消息中心',
          all: '全部',
          unreadFilter: '未读',
          mentions: '提及',
          count: (count) => `${count}条`,
          markRead: () => '设为已读',
          markUnread: () => '设为未读',
          dismiss: () => '移除',
        },
      },
    }
    const html = render(1, content)
    expect(html).toContain('消息中心')
    expect(html).toContain('全部<span class="lumen-notifications-tab-count">80条</span>')
    expect(html).toContain('未读<span class="lumen-notifications-tab-count">40条</span>')
    expect(html).toContain('提及<span class="lumen-notifications-tab-count">20条</span>')
    expect((html.match(/<li data-unread/g) ?? []).length).toBe(40)
    expect((html.match(/<li/g) ?? []).length).toBe(80)
    expect(html).toContain('aria-label="设为已读"')
    expect(html).toContain('aria-label="设为未读"')
    expect(html).toContain('aria-label="移除"')
    expect(html).not.toContain('Ana Reyes')
  })

  test('toast controls, empty summary and distinct payloads come from the host', () => {
    const html = render(2)
    const choices = HBAR_APP_UI_NOTIFICATIONS_FIXTURES.toasts!.choices
    expect((html.match(/data-toast-tone=/g) ?? []).length).toBe(choices.length)
    for (const choice of choices) expect(html).toContain(choice.label)
    expect(html).toContain('No active toasts')
    expect(html).toContain('Clear all')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('Deployment live')
    const localized: HbarAppUiNotificationsContent = {
      ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
      toasts: {
        ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES.toasts!,
        labels: {
          ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES.toasts!.labels,
          title: '短消息', detail: '悬停后展开', empty: '没有消息', clear: '清除所有',
          active: (count) => `${count} 条`, dismiss: () => '关闭',
        },
        choices: [{ id: 'custom', label: '完成', title: '保存成功', detail: '新的内容已同步', tone: 'success', action: '撤销' }],
        maximum: 1,
      },
    }
    const localizedHtml = render(2, localized)
    expect(localizedHtml).toContain('短消息')
    expect(localizedHtml).toContain('没有消息')
    expect(localizedHtml).toContain('完成')
    expect(localizedHtml).not.toContain('Toast notifications')
  })

  test('preferences preserve the reference groups, controlled channels and host save boundary', () => {
    const html = render(3)
    expect(html).toContain('14 of 21 deliveries enabled for this workspace.')
    expect((html.match(/role="switch"/g) ?? []).length).toBe(22)
    expect((html.match(/<li/g) ?? []).length).toBe(7)
    expect(html).toContain('data-hbar-app-ui-action="group:collaboration:in-app"')
    expect(html).toContain('data-hbar-app-ui-action="delivery:assigned:push"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('All changes saved')
    expect(html).not.toContain('When someone mentions you')
    expect(render(3, createHbarAppUiNotificationPreferencesFixture('localized'))).toContain('Benachrichtigungseinstellungen')
    expect(render(3, createHbarAppUiNotificationPreferencesFixture('empty'))).toContain('No preferences')
    expect((render(3, createHbarAppUiNotificationPreferencesFixture('overflow')).match(/<li/g) ?? []).length).toBe(81)
    expect((render(3, createHbarAppUiNotificationPreferencesFixture('duplicate')).match(/<li/g) ?? []).length).toBe(7)
    expect(render(3, createHbarAppUiNotificationPreferencesFixture('unavailable'))).toContain('disabled=""')
  })

  test('activity projects host entries into views with typed detail, counts and a confirmed move boundary', () => {
    const html = render(4)
    expect(html).toContain('Priya Nandakumar')
    expect(html).toContain('requested admin access to Cedar Labs billing')
    expect(html).toContain('Cedar Labs billing')
    expect(html).toContain('Grant access')
    expect(html).toContain('Open in console')
    expect(html).toContain('Inbox<span class="lumen-activity-count">3</span>')
    expect(html).toContain('Snoozed<span class="lumen-activity-count">1</span>')
    expect(html).toContain('Archived<span class="lumen-activity-count">1</span>')
    expect((html.match(/<li/g) ?? []).length).toBe(3)
    expect(html).not.toContain('Mina')
    expect(render(4, createHbarAppUiNotificationActivityFixture('localized'))).toContain('Aktivitäten')
    expect(render(4, createHbarAppUiNotificationActivityFixture('empty'))).toContain('Nothing selected')
    expect((render(4, createHbarAppUiNotificationActivityFixture('overflow')).match(/<li/g) ?? []).length).toBe(81)
    expect((render(4, createHbarAppUiNotificationActivityFixture('duplicate')).match(/<li/g) ?? []).length).toBe(3)
    expect(render(4, createHbarAppUiNotificationActivityFixture('unavailable'))).toContain('Action unavailable')
  })

  test('system banners render host-owned messages, named actions, details and bounded scrolling', () => {
    const html = render(5)
    expect((html.match(/class="lumen-system-message"/g) ?? []).length).toBe(5)
    expect(html).toContain('while we migrate the ingest cluster.')
    expect(html).toContain('Renewal for Cedar Labs is due on 12 November.')
    expect(html).toContain('data-hbar-app-ui-action="read-notice"')
    expect(html).toContain('data-hbar-app-ui-action="remind-later"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('4.2 of 5 M events')
    expect(html).not.toContain('role="progressbar"')
    expect(html).not.toContain('Three source files need a schema mapping')
    expect(render(5, createHbarAppUiNotificationSystemFixture('localized'))).toContain('Systemmeldungen')
    expect(render(5, createHbarAppUiNotificationSystemFixture('empty'))).toContain('Dismissed banners do not come back')
    expect((render(5, createHbarAppUiNotificationSystemFixture('one')).match(/class="lumen-system-message"/g) ?? []).length).toBe(1)
    expect((render(5, createHbarAppUiNotificationSystemFixture('overflow')).match(/class="lumen-system-message"/g) ?? []).length).toBe(81)
    expect((render(5, createHbarAppUiNotificationSystemFixture('duplicate')).match(/class="lumen-system-message"/g) ?? []).length).toBe(5)
    expect(render(5, createHbarAppUiNotificationSystemFixture('unavailable'))).toContain('Action unavailable')
  })
})
