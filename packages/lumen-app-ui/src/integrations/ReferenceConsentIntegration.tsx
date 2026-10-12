'use client'

import * as React from 'react'
import { Check, ChevronDown, LockKeyhole, ShieldCheck } from './glyphs'
import type { LumenIntegrationConsentContent } from './content'
import { uniqueLumenIntegrationItems } from './content'
import type { LumenIntegrationsCompositionProps } from './primitives'
import type { LumenIntegrationConsentReferenceLayout } from './reference-content'
import { IntegrationButton, IntegrationFrame, IntegrationIcon } from './primitives'
import './reference-consent.css'

export interface ReferenceConsentIntegrationProps extends LumenIntegrationsCompositionProps {
  readonly content: LumenIntegrationConsentContent
  readonly layout: LumenIntegrationConsentReferenceLayout
}

function uniqueWorkspaceOptions(
  options: LumenIntegrationConsentReferenceLayout['workspaceOptions'],
): LumenIntegrationConsentReferenceLayout['workspaceOptions'] {
  const seen = new Set<string>()
  return options.filter((option) => {
    if (!option.workspaceId.trim() || seen.has(option.workspaceId)) {
      return false
    }
    seen.add(option.workspaceId)
    return true
  })
}

export function ReferenceConsentIntegration({ spec, onAction, content, layout }: ReferenceConsentIntegrationProps) {
  const instanceId = React.useId()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const workspaces = React.useMemo(() => uniqueLumenIntegrationItems(content.workspaces), [content.workspaces])
  const workspaceOptions = React.useMemo(
    () => uniqueWorkspaceOptions(layout.workspaceOptions),
    [layout.workspaceOptions],
  )
  const requestedWorkspaceId = content.referenceFlow?.workspaceId
  const requestedIndex = workspaces.findIndex((workspace) => workspace.id === requestedWorkspaceId)
  const initialIndex = workspaces.findIndex((workspace) => workspace.id === content.initialWorkspaceId)
  let selectedIndex = 0
  if (requestedIndex >= 0) {
    selectedIndex = requestedIndex
  } else if (initialIndex >= 0) {
    selectedIndex = initialIndex
  }
  const selectedWorkspace = workspaces[selectedIndex]
  const pageRef = React.useRef<HTMLElement | null>(null)
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const menuId = `${instanceId}-workspace-listbox`

  React.useEffect(() => {
    if (menuOpen) {
      const initialOption = optionRefs.current[selectedIndex] ?? optionRefs.current[0]
      initialOption?.focus()
    }
  }, [menuOpen, selectedIndex])

  const closeMenu = () => {
    setMenuOpen(false)
    pageRef.current?.querySelector<HTMLButtonElement>('[data-hbar-app-ui-action="select-workspace"]')?.focus()
  }

  const requestWorkspaceChange = (workspaceId: string) => {
    if (content.referenceFlow) {
      content.referenceFlow.onWorkspaceChange(workspaceId)
    } else {
      onAction?.({
        variantId: spec.id,
        actionId: 'select-workspace',
        value: workspaceId,
      })
    }
    closeMenu()
  }

  const moveWorkspaceFocus = (nextIndex: number) => {
    const bounded = (nextIndex + workspaces.length) % workspaces.length
    optionRefs.current[bounded]?.focus()
    return bounded
  }

  const handleWorkspaceKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' && workspaces.length > 0) {
      event.preventDefault()
      setMenuOpen(true)
    } else if (event.key === 'Escape' && menuOpen) {
      event.preventDefault()
      closeMenu()
    }
  }

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (workspaces.length === 0) {
      return
    }
    let nextIndex: number | undefined
    switch (event.key) {
      case 'ArrowDown':
        nextIndex = moveWorkspaceFocus(index + 1)
        break
      case 'ArrowUp':
        nextIndex = moveWorkspaceFocus(index - 1)
        break
      case 'Home':
        nextIndex = moveWorkspaceFocus(0)
        break
      case 'End':
        nextIndex = moveWorkspaceFocus(workspaces.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        closeMenu()
        return
      default:
        return
    }
    if (nextIndex !== undefined) {
      event.preventDefault()
    }
  }

  const requestCancel = () => {
    if (content.referenceFlow) {
      content.referenceFlow.onCancel()
    } else {
      onAction?.({
        variantId: spec.id,
        actionId: 'deny',
        value: selectedWorkspace?.id,
      })
    }
  }

  const requestAuthorization = () => {
    if (!selectedWorkspace) {
      return
    }
    if (content.referenceFlow) {
      content.referenceFlow.onAuthorize()
    } else {
      onAction?.({
        variantId: spec.id,
        actionId: 'authorize',
        value: selectedWorkspace.id,
      })
    }
  }

  return (
    <IntegrationFrame spec={spec} onAction={onAction} className="lumen-integration-consent-reference-surface">
      <main className="lumen-integration-consent-reference-page" data-hbar-app-ui-owner={layout.ownerId} ref={pageRef}>
        <section className="lumen-integration-consent-reference-card">
          <div className="lumen-integration-consent-reference-brands">
            <span className="lumen-integration-consent-reference-brand">{content.requesterInitials}</span>
            <span className="lumen-integration-consent-reference-connector" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="lumen-integration-consent-reference-brand lumen-integration-consent-reference-brand-workspace">
              {content.workspaceInitials}
            </span>
          </div>

          <header className="lumen-integration-consent-reference-heading">
            <h2>{content.title}</h2>
            <p>{content.description}</p>
          </header>

          <div className="lumen-integration-consent-reference-workspace-field">
            <span>{content.labels.workspaceLabel}</span>
            <div className="lumen-integration-consent-reference-workspace-trigger-wrap">
              <IntegrationButton
                aria-controls={menuOpen ? menuId : undefined}
                aria-expanded={menuOpen}
                aria-haspopup="listbox"
                aria-label={
                  selectedWorkspace
                    ? `${content.labels.workspaceLabel}: ${selectedWorkspace.label}`
                    : `${content.labels.workspaceLabel}: ${layout.labels.emptyWorkspaces}`
                }
                className="lumen-integration-consent-reference-workspace-trigger"
                data-hbar-app-ui-action="select-workspace"
                data-hbar-app-ui-target={layout.ownerId}
                disabled={workspaces.length === 0}
                onClick={() => setMenuOpen((current) => !current)}
                onKeyDown={handleWorkspaceKeyDown}
                type="button"
              >
                {selectedWorkspace ? (
                  <React.Fragment>
                    <span className="lumen-integration-consent-reference-workspace-initials">
                      {selectedWorkspace.initials}
                    </span>
                    <strong>{selectedWorkspace.name}</strong>
                    <span className="lumen-integration-consent-reference-workspace-role">{selectedWorkspace.role}</span>
                  </React.Fragment>
                ) : (
                  <span>{layout.labels.emptyWorkspaces}</span>
                )}
                <IntegrationIcon tier="sm">
                  <ChevronDown />
                </IntegrationIcon>
              </IntegrationButton>
              {menuOpen && workspaces.length > 0 && (
                <ul
                  aria-label={content.labels.workspaceLabel}
                  className="lumen-integration-consent-reference-workspace-menu"
                  id={menuId}
                  role="listbox"
                >
                  {workspaces.map((workspace, index) => {
                    const optionDetail = workspaceOptions.find((option) => option.workspaceId === workspace.id)?.detail
                    const selected = workspace.id === selectedWorkspace?.id && index === selectedIndex
                    return (
                      <li key={workspace.id} role="presentation">
                        <IntegrationButton
                          aria-selected={selected}
                          className="lumen-integration-consent-reference-workspace-option"
                          data-hbar-app-ui-action="choose-workspace"
                          data-hbar-app-ui-target={workspace.id}
                          id={`${menuId}-option-${index}`}
                          onClick={() => requestWorkspaceChange(workspace.id)}
                          onKeyDown={(event) => handleOptionKeyDown(event, index)}
                          ref={(element) => {
                            optionRefs.current[index] = element
                          }}
                          role="option"
                          tabIndex={index === selectedIndex ? 0 : -1}
                          type="button"
                        >
                          <span>{workspace.name}</span>
                          <span>
                            {optionDetail}
                            {selected && (
                              <IntegrationIcon tier="sm">
                                <Check />
                              </IntegrationIcon>
                            )}
                          </span>
                        </IntegrationButton>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          <ul
            className="lumen-integration-consent-reference-permissions"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {uniqueLumenIntegrationItems(content.permissions).map((permission) => (
              <li key={permission.id}>
                <IntegrationIcon tier="sm">
                  <Check />
                </IntegrationIcon>
                <div>
                  <strong>{permission.title}</strong>
                  <p>{permission.description}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="lumen-integration-consent-reference-assurance">
            <IntegrationIcon tier="sm">
              <ShieldCheck />
            </IntegrationIcon>
            <span>{content.assurance}</span>
          </p>

          <div className="lumen-integration-consent-reference-actions">
            <IntegrationButton
              data-hbar-app-ui-action="cancel"
              data-hbar-app-ui-target={layout.ownerId}
              onClick={requestCancel}
              type="button"
            >
              {content.labels.cancel}
            </IntegrationButton>
            <IntegrationButton
              data-hbar-app-ui-action="authorize"
              data-hbar-app-ui-target={selectedWorkspace?.id ?? ''}
              disabled={!selectedWorkspace}
              onClick={requestAuthorization}
              tone="accent"
              type="button"
            >
              {content.labels.authorize}
            </IntegrationButton>
          </div>

          <footer className="lumen-integration-consent-reference-footer">
            <IntegrationIcon tier="sm">
              <LockKeyhole />
            </IntegrationIcon>
            <span>{content.labels.redirectNotice}</span>
          </footer>
        </section>
      </main>
    </IntegrationFrame>
  )
}
