import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider } from '@hbar/app-react'
import { HbarChatDatabaseSettings } from '@hbar/app-react/chat-database'
import { createAppRuntime } from '@hbar/app-runtime'
import { chatDatabaseCopy } from '../apps/web/src/chat-database-copy'

const directory = { execute: () => Promise.reject(new Error('No directory query expected during static rendering')) }

test('database settings renders host-owned long Chinese labels and a genuine empty history', () => {
  const runtime = createAppRuntime({ instanceId: 'long-copy', hostId: 'host', directory })
  const long = '针对当前聊天数据库的历史内容、缓存和共享附件进行占用监控与清理配置。'.repeat(5)
  const labels = { ...chatDatabaseCopy('zh-CN'), title: long, refresh: long }
  try {
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarChatDatabaseSettings
          instanceId="long-copy"
          scope={{ kind: 'global' }}
          connected={false}
          labels={labels}
          ruleForm={<input aria-label={long} defaultValue="95" />}
          savedRevision="0"
        />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain(long)
    expect(html).toContain(labels.noRecords)
    expect(html).toContain(labels.offline)
    expect(html).not.toContain('data-operation-id=')
    expect(html.match(/hbar-chat-database-action/g)).toHaveLength(4)
  } finally {
    runtime.dispose()
  }
})

test('a scoped database surface omits global-only actions while preserving its host form', () => {
  const runtime = createAppRuntime({ instanceId: 'scoped-copy', hostId: 'host', directory })
  const labels = chatDatabaseCopy('en-US')
  try {
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarChatDatabaseSettings
          instanceId="scoped"
          scope={{ kind: 'session', targetId: 'original' }}
          connected={true}
          labels={labels}
          ruleForm={<input aria-label="host field" defaultValue="95" />}
          savedRevision="0"
        />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain(labels.scopedHelp)
    expect(html).toContain('value="95"')
    expect(html.match(/hbar-chat-database-action/g)).toHaveLength(2)
    for (const action of labels.actions.filter((item) => item.globalOnly)) expect(html).not.toContain(action.title)
  } finally {
    runtime.dispose()
  }
})
