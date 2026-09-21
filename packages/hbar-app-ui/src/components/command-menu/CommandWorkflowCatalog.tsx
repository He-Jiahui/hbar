import { LumenButton } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../../types'
import { CommandBackdrop, CommandFrame, useCommandEscape } from './CommandPrimitives'
import { useCommandMenuContent } from './CommandContent'
import { HbarAppUiSearchCommands, HbarAppUiInviteCommand, HbarAppUiAssistantCommands } from './CommandWorkflows'

export function CommandWorkflowCatalog(props: HbarAppUiVariantProps) {
  const all = useCommandMenuContent(),
    content = props.spec.variant === 3 ? all.search : props.spec.variant === 4 ? all.invite : all.assistant
  useCommandEscape(content?.open ?? false, () => content?.onClose())
  return (
    <CommandFrame {...props} className={`hbar-app-ui-command-variant-${props.spec.variant}`}>
      {content && (
        <>
          <LumenButton type="button" className="hbar-app-ui-command-trigger" onClick={content.onOpen}>
            {content.trigger}
          </LumenButton>
          {content.open && (
            <CommandBackdrop closeLabel={content.closeLabel} onClose={content.onClose}>
              <section
                role="dialog"
                aria-modal="true"
                aria-label={content.title}
                className={`hbar-app-ui-command-dialog ${props.spec.variant === 3 ? 'hbar-app-ui-command-dialog-search' : props.spec.variant === 4 ? 'hbar-app-ui-command-dialog-form' : 'hbar-app-ui-command-dialog-assistant'}`}
              >
                {props.spec.variant === 3 && all.search && <HbarAppUiSearchCommands {...all.search} />}
                {props.spec.variant === 4 && all.invite && <HbarAppUiInviteCommand {...all.invite} />}
                {props.spec.variant === 5 && all.assistant && <HbarAppUiAssistantCommands {...all.assistant} />}
              </section>
            </CommandBackdrop>
          )}
        </>
      )}
    </CommandFrame>
  )
}
