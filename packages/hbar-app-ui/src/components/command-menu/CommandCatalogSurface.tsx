import { LumenButton } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../../types'
import { CommandBackdrop, CommandFrame, useCommandEscape } from './CommandPrimitives'
import { HbarAppUiCommandList } from './CommandList'
import type { HbarAppUiCommandSurfaceContent } from './CommandContent'

export function CommandCatalogSurface({
  spec,
  onAction,
  content,
}: { readonly content: HbarAppUiCommandSurfaceContent | undefined } & HbarAppUiVariantProps) {
  useCommandEscape(content?.open ?? false, () => content?.onClose())
  return (
    <CommandFrame spec={spec} onAction={onAction} className={`hbar-app-ui-command-variant-${spec.variant}`}>
      {content && (
        <>
          <LumenButton type="button" className="hbar-app-ui-command-trigger" onClick={content.onOpen}>
            {content.trigger}
          </LumenButton>
          {content.open && (
            <CommandBackdrop onClose={content.onClose} closeLabel={content.labels.close}>
              <section
                className={`hbar-app-ui-command-dialog ${spec.variant === 6 ? 'hbar-app-ui-command-dialog-room' : 'hbar-app-ui-command-dialog-list'}`}
                role="dialog"
                aria-modal="true"
                aria-label={content.title}
              >
                <HbarAppUiCommandList {...content} />
              </section>
            </CommandBackdrop>
          )}
        </>
      )}
    </CommandFrame>
  )
}
