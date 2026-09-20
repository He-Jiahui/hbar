import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { FolderTree, RefreshCw } from 'lucide-react'
import { HbarAppUiIcon } from '../packages/hbar-app-ui/src/icon'
import { HbarAppUiIconButton } from '../packages/hbar-app-ui/src/primitives'
import { HbarAppUiToolPane } from '../packages/hbar-app-ui/src/tool-pane'

test('tool pane exposes host-owned navigation, target, state, body, and fixed action slots', () => {
  const html = renderToStaticMarkup(
    <HbarAppUiToolPane
      title="文件树"
      targetLabel="hbar / 视觉重构"
      description="浏览当前工作区"
      icon={FolderTree}
      backLabel="返回文件列表"
      closeLabel="关闭文件树"
      onBack={() => {}}
      onClose={() => {}}
      actions={
        <HbarAppUiIconButton label="刷新">
          <HbarAppUiIcon icon={RefreshCw} tier="sm" />
        </HbarAppUiIconButton>
      }
      toolbar={<label>过滤文件</label>}
      status={<span>正在同步</span>}
      error={<span>无法读取目录</span>}
      footer={<button type="button">保存</button>}
      busy
    >
      <div>文件内容</div>
    </HbarAppUiToolPane>,
  )

  expect(html).toContain('class="hbar-app-ui-session-tool-pane"')
  expect(html).toContain('aria-label="文件树"')
  expect(html).toContain('aria-busy="true"')
  expect(html).toContain('hbar / 视觉重构')
  expect(html).toContain('aria-label="返回文件列表"')
  expect(html).toContain('aria-label="关闭文件树"')
  expect(html).toContain('data-tool-pane-slot="toolbar"')
  expect(html).toContain('data-tool-pane-slot="status"')
  expect(html).toContain('data-tool-pane-slot="error" role="alert"')
  expect(html).toContain('data-tool-pane-slot="body"')
  expect(html).toContain('data-tool-pane-slot="footer"')
  expect(html).toContain('文件内容')
})

test('tool pane omits optional controls instead of inventing visible labels', () => {
  const html = renderToStaticMarkup(<HbarAppUiToolPane title="Monitoring">Usage</HbarAppUiToolPane>)

  expect(html).toContain('aria-label="Monitoring"')
  expect(html).toContain('data-tool-pane-slot="body"')
  expect(html).not.toContain('aria-label="Back"')
  expect(html).not.toContain('aria-label="Close"')
  expect(html).not.toContain('data-tool-pane-slot="footer"')
})
