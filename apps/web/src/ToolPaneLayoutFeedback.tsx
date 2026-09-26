import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import type { useToolPaneLayout } from './tool-pane-layout'
import type { ToolPaneLayoutLabels } from './tool-pane-layout-copy'

export function ToolPaneLayoutFeedback({
  controller,
  labels,
}: {
  readonly controller: ReturnType<typeof useToolPaneLayout>
  readonly labels: ToolPaneLayoutLabels
}) {
  const receipt = controller.receipt
  if (receipt.status === 'idle') return null
  return (
    <LumenFrame className="hbar-web-tool-layout-feedback" data-tool-layout-status={receipt.status}>
      <LumenText as="span" role={receipt.status === 'failed' ? 'alert' : 'status'}>
        {receipt.status === 'failed' ? labels.failed(receipt.code) : labels.saving}
      </LumenText>
      {receipt.status === 'failed' ? (
        <LumenButton
          variant="text"
          indicator="none"
          size="s"
          disabled={controller.disabled}
          onClick={() => {
            void controller.commit(receipt.widthRem).catch(() => undefined)
          }}
        >
          {labels.retry}
        </LumenButton>
      ) : null}
    </LumenFrame>
  )
}
