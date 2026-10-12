'use client'

import './settings-form-6-reference.css'
import * as React from 'react'

export type LumenSettingsForm6ActionIntent =
  | { readonly type: 'transfer' | 'archive' | 'cancel' | 'review'; readonly workspaceId: string }
  | { readonly type: 'delete'; readonly workspaceId: string; readonly confirmation: string }

export interface LumenSettingsForm6Workspace {
  readonly id: string
  readonly name: string
  readonly memberCount: number
}

export interface LumenSettingsForm6Labels {
  readonly pageTitle: string
  readonly panelTitle: string
  readonly panelDescription: string
  readonly transferTitle: string
  readonly transferDescription: string
  readonly transferAction: string
  readonly archiveTitle: string
  readonly archiveDescription: string
  readonly archiveAction: string
  readonly deleteTitle: string
  readonly deleteDescription: string
  readonly deleteImpactHeading: string
  readonly impactItems: readonly string[]
  readonly confirmationPrompt: string
  readonly cancelAction: string
  readonly deleteAction: string
  readonly reviewAction?: string | undefined
  readonly footerNote: string
}

export interface LumenSettingsForm6ReferenceProps {
  readonly labels: LumenSettingsForm6Labels
  readonly workspace: LumenSettingsForm6Workspace
  readonly confirmationValue: string
  readonly confirmationVisible?: boolean | undefined
  readonly onConfirmationValueChange: (value: string) => void
  readonly onAction?: ((action: LumenSettingsForm6ActionIntent) => void) | undefined
  readonly instanceId?: string | undefined
}

export type LumenSettingsForm6ViewModel = Omit<LumenSettingsForm6ReferenceProps, 'instanceId'>

export function LumenSettingsForm6Reference({
  labels,
  workspace,
  confirmationValue,
  confirmationVisible = true,
  onConfirmationValueChange,
  onAction,
  instanceId = 'settings-form-6',
}: LumenSettingsForm6ReferenceProps) {
  const confirmationId = `${instanceId}-confirmation`

  return (
    <div className="lumen-settings-form-6-reference" data-hbar-app-ui-component="hbar-app-ui-settings-form-6">
      <header className="lumen-settings-form-6-page-heading">
        <h2>{labels.pageTitle}</h2>
      </header>

      <div className="lumen-settings-form-6-content">
        <div className="lumen-settings-form-6-panel">
          <div className="lumen-settings-form-6-panel-heading">
            <h3>{labels.panelTitle}</h3>
            <p>{labels.panelDescription}</p>
          </div>

          <div className="lumen-settings-form-6-action-list">
            <div className="lumen-settings-form-6-action-row">
              <div className="lumen-settings-form-6-action-copy">
                <p>{labels.transferTitle}</p>
                <p>{labels.transferDescription}</p>
              </div>
              <button
                className="lumen-settings-form-6-secondary-action"
                type="button"
                onClick={() => onAction?.({ type: 'transfer', workspaceId: workspace.id })}
              >
                {labels.transferAction}
              </button>
            </div>

            <div className="lumen-settings-form-6-action-row">
              <div className="lumen-settings-form-6-action-copy">
                <p>{labels.archiveTitle}</p>
                <p>{labels.archiveDescription}</p>
              </div>
              <button
                className="lumen-settings-form-6-secondary-action"
                type="button"
                onClick={() => onAction?.({ type: 'archive', workspaceId: workspace.id })}
              >
                {labels.archiveAction}
              </button>
            </div>

            <div className="lumen-settings-form-6-delete-zone">
              <div className="lumen-settings-form-6-action-copy">
                <p>{labels.deleteTitle}</p>
                <p>{labels.deleteDescription}</p>
              </div>

              <div className="lumen-settings-form-6-impact-list">
                <p>{labels.deleteImpactHeading}</p>
                <ul>
                  {labels.impactItems.map((impact, index) => (
                    <li key={`${index}-${impact}`}>{impact}</li>
                  ))}
                </ul>
              </div>

              {confirmationVisible && (
                <React.Fragment>
                  <div className="lumen-settings-form-6-confirmation-field">
                    <label htmlFor={confirmationId}>{labels.confirmationPrompt}</label>
                    <input
                      id={confirmationId}
                      value={confirmationValue}
                      onChange={(event) => onConfirmationValueChange(event.currentTarget.value)}
                    />
                  </div>

                  <div className="lumen-settings-form-6-delete-actions">
                    <button
                      className="lumen-settings-form-6-secondary-action"
                      type="button"
                      onClick={() => onAction?.({ type: 'cancel', workspaceId: workspace.id })}
                    >
                      {labels.cancelAction}
                    </button>
                    <button
                      className="lumen-settings-form-6-destructive-action"
                      type="button"
                      onClick={() =>
                        onAction?.({
                          type: 'delete',
                          workspaceId: workspace.id,
                          confirmation: confirmationValue,
                        })
                      }
                    >
                      {labels.deleteAction}
                    </button>
                  </div>
                </React.Fragment>
              )}
              {!confirmationVisible && labels.reviewAction && (
                <div className="lumen-settings-form-6-delete-actions">
                  <button
                    className="lumen-settings-form-6-destructive-action"
                    type="button"
                    onClick={() => onAction?.({ type: 'review', workspaceId: workspace.id })}
                  >
                    {labels.reviewAction}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="lumen-settings-form-6-panel-footer">{labels.footerNote}</div>
        </div>
      </div>
    </div>
  )
}
