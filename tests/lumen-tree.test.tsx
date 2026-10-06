import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenTree, LumenTreeItem } from '@lumen/app-ui'

for (const count of [0, 1, 60, 61]) {
  test(`tree renders ${count} Host nodes in accessible flow without navigation button wrappers`, () => {
    const html = renderToStaticMarkup(
      <LumenTree label="工程与会话，包含较长的本地化导航标题">
        {Array.from({ length: count }, (_, index) => (
          <LumenTreeItem
            key={index}
            nodeId={`node-${index}`}
            label={`宿主节点 ${index}`}
            content={<span>{`宿主节点 ${index}`}</span>}
          />
        ))}
      </LumenTree>,
    )
    expect(html.match(/role="treeitem"/g) ?? []).toHaveLength(count)
    expect(html).toContain('role="tree"')
    expect(html).toContain('工程与会话，包含较长的本地化导航标题')
    expect(html).not.toContain('<button')
  })
}

test('project, parent Session and subagent are real nested levels with controlled state', () => {
  const html = renderToStaticMarkup(
    <LumenTree label="工程与会话">
      <LumenTreeItem nodeId="project" label="hbar" expanded content={<span>hbar</span>} onExpandedChange={() => {}}>
        <LumenTreeItem
          nodeId="parent"
          label="父会话"
          expanded
          content={<span>父会话</span>}
          onExpandedChange={() => {}}
        >
          <LumenTreeItem nodeId="child" label="子 agent" selected content={<span>子 agent</span>} />
        </LumenTreeItem>
      </LumenTreeItem>
    </LumenTree>,
  )
  expect(html).toContain('aria-level="1"')
  expect(html).toContain('aria-level="2"')
  expect(html).toContain('aria-level="3"')
  expect(html.match(/role="group"/g) ?? []).toHaveLength(2)
  expect(html.match(/aria-expanded="true"/g) ?? []).toHaveLength(2)
  expect(html.match(/aria-selected="true"/g) ?? []).toHaveLength(1)
})

test('collapsed nodes do not mount fake descendants and node actions remain actual independent buttons', () => {
  const html = renderToStaticMarkup(
    <LumenTree label="工程与会话">
      <LumenTreeItem
        nodeId="project"
        label="hbar"
        expanded={false}
        onExpandedChange={() => {}}
        content={
          <>
            <span>hbar</span>
            <button>节点附属菜单</button>
          </>
        }
      >
        <LumenTreeItem nodeId="hidden" label="尚未展开的会话" content={<span>不应显示</span>} />
      </LumenTreeItem>
    </LumenTree>,
  )
  expect(html.match(/role="treeitem"/g) ?? []).toHaveLength(1)
  expect(html).not.toContain('尚未展开的会话')
  expect(html.match(/<button/g) ?? []).toHaveLength(1)
})
