import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  LumenAdaptiveToolbar,
  LumenButton,
  LumenContentText,
  LumenProvider,
  LumenRecordRow,
  LumenSurface,
  DEFAULT_LUMEN_APPEARANCE,
} from '@lumen/app-ui'
import '../../packages/hbar-app-ui/src/theme.css'

function StatefulAction({ label, onAction }: { label: string; onAction: () => void }) {
  const [count, setCount] = useState(0)
  return (
    <LumenButton
      size="s"
      variant="text"
      aria-label={label}
      onClick={() => {
        setCount((value) => value + 1)
        onAction()
      }}
    >
      {label} · {count}
    </LumenButton>
  )
}

function Fixture() {
  const zh = document.documentElement.lang.startsWith('zh')
  const labels = zh
    ? ['选择完整模型名称', '自动批准工具操作', '当前上下文使用情况', '推理强度', '更多操作', '发送', '操作结果']
    : [
        'Choose complete model name',
        'Automatic tool approval',
        'Current context usage',
        'Reasoning effort',
        'More actions',
        'Send',
        'Action result',
      ]
  const [last, setLast] = useState('')
  return (
    <LumenProvider
      appearance={{
        ...DEFAULT_LUMEN_APPEARANCE,
        mode: document.documentElement.dataset.lumenMode === 'light' ? 'light' : 'dark',
      }}
    >
      <LumenSurface surfaceRole="reading" className="composition-fixture">
        <LumenContentText context="page.title">{zh ? '工作台通用组件' : 'Workbench compositions'}</LumenContentText>
        <LumenAdaptiveToolbar
          label={labels[6]!}
          moreLabel={labels[4]!}
          items={labels.slice(0, 4).map((label, index) => ({
            id: String(index),
            label,
            priority: index === 0 ? 100 : 10,
            content: <StatefulAction label={label} onAction={() => setLast(label)} />,
          }))}
          trailing={<LumenButton onClick={() => setLast(labels[5]!)}>{labels[5]}</LumenButton>}
        />
        <LumenContentText context="feedback.detail" role="status">
          {last}
        </LumenContentText>
        <LumenRecordRow
          title={zh ? '完整的请求模型与时间信息' : 'Complete request model and timestamp'}
          description={
            zh
              ? '说明内容按照阅读位置自然换行，不改变按钮与状态标签。'.repeat(8)
              : 'Description flows naturally without changing control labels. '.repeat(8)
          }
        />
        <LumenContentText context="navigation.item" data-testid="clipped">
          {'project_c / 非常长的工程与会话名称 '.repeat(20)}
        </LumenContentText>
      </LumenSurface>
    </LumenProvider>
  )
}
createRoot(document.getElementById('fixture-root')!).render(<Fixture />)
