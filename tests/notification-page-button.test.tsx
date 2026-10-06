import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NotificationPageButton } from '../apps/web/src/NotificationPageButton'
import { notificationNavigationCopy } from '../apps/web/src/notification-copy'

for (const locale of ['zh-CN', 'en-US'] as const) {
  for (const unreadCount of [0, 9, 999]) {
    test(`notification page entry keeps its exact accessible count and bounded badge: ${locale}/${unreadCount}`, () => {
      const labels = notificationNavigationCopy(locale)
      const html = renderToStaticMarkup(
        createElement(NotificationPageButton, {
          labels,
          unreadCount,
          selected: true,
          onOpen: () => {},
        }),
      )
      expect(html).toContain(`aria-label="${labels.bell(unreadCount)}"`)
      expect(html).toContain('aria-current="page"')
      expect(html).not.toContain('aria-haspopup')
      expect(html).not.toContain('aria-expanded')
      expect(html).not.toContain('role="dialog"')
      if (unreadCount === 0) expect(html).not.toContain('hbar-web-notification-count')
      else expect(html).toContain(`>${labels.count(unreadCount)}</span>`)
    })
  }
}

test('the notification entry accepts complete host-supplied long captions and no active page', () => {
  const label = '通知中心 — 全局运行、审批与排期的完整通知列表和通知渠道设置'
  const html = renderToStaticMarkup(
    createElement(NotificationPageButton, {
      labels: { bell: () => label, count: (count) => String(count) },
      unreadCount: 1,
      selected: false,
      onOpen: () => {},
    }),
  )
  expect(html).toContain(`title="${label}"`)
  expect(html).not.toContain('aria-current')
})
