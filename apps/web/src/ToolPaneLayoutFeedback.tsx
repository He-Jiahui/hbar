import { LumenButton, LumenFrame, LumenContentText } from '@lumen/app-ui'
import type { useToolPaneLayout } from './tool-pane-layout'
import type { ToolPaneLayoutLabels } from './tool-pane-layout-copy'

export function ToolPaneLayoutFeedback({
  controller,
  labels,
  surface = 'tool',
}: {
  readonly controller: ReturnType<typeof useToolPaneLayout>
  readonly labels: ToolPaneLayoutLabels
  readonly surface?: 'tool' | 'sidebar'
}) {
  const receipt = controller.receipt
  if (receipt.status === 'idle') return null
  return (
    <LumenFrame
      className="hbar-web-tool-layout-feedback"
      data-tool-layout-status={surface === 'tool' ? receipt.status : undefined}
      data-sidebar-layout-status={surface === 'sidebar' ? receipt.status : undefined}
    >
      <LumenContentText context="control.status" role={receipt.status === 'failed' ? 'alert' : 'status'}>
        {receipt.status === 'failed' ? labels.failed(receipt.code) : labels.saving}
      </LumenContentText>
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
