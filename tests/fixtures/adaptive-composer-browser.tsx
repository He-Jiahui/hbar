import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  LumenButton,
  LumenContentText,
  LumenFrame,
  LumenPromptComposer,
  LumenProvider,
  DEFAULT_LUMEN_APPEARANCE,
} from '@lumen/app-ui'
import '../../packages/hbar-app-ui/src/theme.css'

function Fixture() {
  const [value, setValue] = useState('')
  const [active, setActive] = useState(false)
  const [sent, setSent] = useState('')
  const [calls, setCalls] = useState(0)
  const [revision, setRevision] = useState(0)
  const labels = {
    input: '提示词',
    placeholder: '输入完整消息',
    send: '发送',
    submitTitle: '发送消息',
    stop: '停止',
    uploading: '上传中',
    addAttachment: '添加附件',
    removeAttachment: () => '移除附件',
  }
  return (
    <LumenProvider
      appearance={{
        ...DEFAULT_LUMEN_APPEARANCE,
        mode: document.documentElement.dataset.lumenMode === 'light' ? 'light' : 'dark',
      }}
    >
      <LumenFrame className="composer-fixture">
        <LumenButton onClick={() => setRevision((count) => count + 1)}>显示模型控制</LumenButton>
        <LumenPromptComposer
          value={value}
          labels={labels}
          attachments={[]}
          submitting={false}
          uploading={false}
          canSubmit={Boolean(value.trim())}
          canStop={active}
          runningActions={
            active
              ? { submit: value.trim() ? 'queue' : 'hidden', queueLabel: '排队发送', queueTitle: '排队发送完整消息' }
              : undefined
          }
          toolbar={{
            moreLabel: '更多输入操作',
            revealRequest: { id: 'model', revision },
            items: [
              {
                id: 'approval',
                label: '自动批准',
                priority: 10,
                content: (
                  <LumenButton variant="text" size="s">
                    自动批准工具执行与文件写入
                  </LumenButton>
                ),
              },
              {
                id: 'model',
                label: '模型',
                priority: 100,
                content: (
                  <LumenButton variant="text" size="s" onClick={() => setCalls((count) => count + 1)}>
                    完整模型与推理设置 · {calls}
                  </LumenButton>
                ),
              },
            ],
          }}
          onChange={setValue}
          onRemoveAttachment={() => {}}
          onStop={() => setActive(false)}
          onSubmit={() => {
            setSent(value)
            setActive(true)
            setValue('')
          }}
        />
        <LumenContentText context="feedback.detail" role="status">
          {sent}
        </LumenContentText>
      </LumenFrame>
    </LumenProvider>
  )
}
createRoot(document.getElementById('fixture-root')!).render(<Fixture />)
