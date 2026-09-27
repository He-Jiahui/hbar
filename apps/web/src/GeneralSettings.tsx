import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { useStore } from 'zustand'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import { WEB_LANGUAGE_CHOICES, type WebLanguageController, type WebLanguagePreference } from './language'
import { WEB_SEND_BEHAVIORS, type WebSendBehavior, type WebSendBehaviorController } from './send-behavior'
import type { ShellLocale } from './shell-copy'
import './GeneralSettings.css'

export interface WebGeneralSettingsLabels {
  readonly group: string
  readonly title: string
  readonly description: string
  readonly deviceScope: string
  readonly language: string
  readonly languageDescription: string
  readonly options: Readonly<Record<WebLanguagePreference, string>>
  readonly systemPolicy: string
  readonly currentLanguage: (locale: ShellLocale) => string
  readonly saved: string
  readonly readError: (code: string) => string
  readonly saveError: string
  readonly retryRead: string
  readonly retrySave: string
  readonly sending: {
    readonly title: string
    readonly description: string
    readonly hostScope: string
    readonly options: Readonly<Record<WebSendBehavior, { readonly label: string; readonly description: string }>>
    readonly loading: string
    readonly saved: string
    readonly readError: (code: string) => string
    readonly saveError: (code: string) => string
    readonly unknown: string
    readonly unsupported: string
    readonly retryRead: string
    readonly recheck: string
    readonly retryOriginal: string
  }
}

function WebGeneralSendBehavior({
  labels,
  controller,
  connected,
}: {
  readonly labels: WebGeneralSettingsLabels['sending']
  readonly controller: WebSendBehaviorController
  readonly connected: boolean
}) {
  const state = useStore(controller.store)
  const choices = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef(false)
  useLayoutEffect(() => {
    if (!restoreFocus.current || (state.status !== 'ready' && state.status !== 'saved')) return
    restoreFocus.current = false
    choices.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
  }, [state.status])
  const recover = (event: MouseEvent<HTMLButtonElement>, action: () => Promise<void>) => {
    restoreFocus.current = document.activeElement === event.currentTarget
    void action()
  }
  const choiceDisabled =
    !connected ||
    state.revision === null ||
    state.status === 'loading' ||
    state.status === 'read-error' ||
    state.status === 'unsupported' ||
    state.status === 'saving' ||
    state.status === 'unknown'
  return (
    <LumenFrame as="fieldset" className="hbar-web-general-sending">
      <LumenText as="legend" id="hbar-general-sending-label" variant="label">
        {labels.title}
      </LumenText>
      <LumenText as="p" id="hbar-general-sending-help" tone="muted" variant="supporting">
        {labels.description}
      </LumenText>
      <LumenText as="p" tone="subtle" variant="supporting">
        {labels.hostScope}
      </LumenText>
      <LumenFrame
        ref={choices}
        role="group"
        aria-labelledby="hbar-general-sending-label"
        aria-describedby="hbar-general-sending-help"
        className="hbar-web-general-send-choices"
      >
        {WEB_SEND_BEHAVIORS.map((behavior) => (
          <LumenButton
            key={behavior}
            variant="outlined"
            indicator="none"
            className="hbar-web-general-send-choice"
            aria-pressed={state.behavior === behavior}
            disabled={choiceDisabled}
            onClick={() => controller.select(behavior)}
          >
            <LumenText as="span" className="hbar-web-general-send-title">
              {labels.options[behavior].label}
            </LumenText>
            <LumenText as="span" tone="muted" variant="supporting">
              {labels.options[behavior].description}
            </LumenText>
          </LumenButton>
        ))}
      </LumenFrame>
      {state.status === 'loading' && <LumenText role="status">{labels.loading}</LumenText>}
      {state.status === 'saved' && <LumenText role="status">{labels.saved}</LumenText>}
      {state.status === 'unsupported' && <LumenText role="alert">{labels.unsupported}</LumenText>}
      {state.status === 'read-error' && (
        <LumenFrame className="hbar-web-general-feedback">
          <LumenText role="alert">{labels.readError(state.error ?? 'EXECUTION_FAILED')}</LumenText>
          <LumenButton disabled={!connected} onClick={(event) => recover(event, controller.refresh)}>
            {labels.retryRead}
          </LumenButton>
        </LumenFrame>
      )}
      {state.status === 'save-error' && (
        <LumenFrame className="hbar-web-general-feedback">
          <LumenText role="alert">{labels.saveError(state.error ?? 'EXECUTION_FAILED')}</LumenText>
          <LumenButton disabled={!connected} onClick={(event) => recover(event, controller.refresh)}>
            {labels.retryRead}
          </LumenButton>
        </LumenFrame>
      )}
      {state.status === 'unknown' && (
        <LumenFrame className="hbar-web-general-feedback">
          <LumenText role="alert">{labels.unknown}</LumenText>
          <LumenButton disabled={!connected} onClick={(event) => recover(event, controller.reconcile)}>
            {labels.recheck}
          </LumenButton>
          <LumenButton disabled={!connected} onClick={(event) => recover(event, controller.retry)}>
            {labels.retryOriginal}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

export function WebGeneralSettings({
  labels,
  language,
  sendBehavior,
  connected = true,
}: {
  readonly labels: WebGeneralSettingsLabels
  readonly language: WebLanguageController
  readonly sendBehavior?: WebSendBehaviorController | undefined
  readonly connected?: boolean | undefined
}) {
  const state = useStore(language.store)
  const choices = useRef<HTMLDivElement>(null)
  const restoreRecoveryFocus = useRef(false)
  const retry = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    restoreRecoveryFocus.current = document.activeElement === event.currentTarget
    action()
    const next = language.store.getState().status
    if (next === 'read-error' || next === 'save-error') restoreRecoveryFocus.current = false
  }
  useLayoutEffect(() => {
    if (!restoreRecoveryFocus.current) return
    restoreRecoveryFocus.current = false
    choices.current?.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]')?.focus()
  }, [state.status])
  const chooseWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, current: number) => {
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? WEB_LANGUAGE_CHOICES.length - 1
          : event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? (current + 1) % WEB_LANGUAGE_CHOICES.length
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? (current + WEB_LANGUAGE_CHOICES.length - 1) % WEB_LANGUAGE_CHOICES.length
              : null
    if (next === null) return
    event.preventDefault()
    const choice = WEB_LANGUAGE_CHOICES[next]
    if (!choice) return
    language.select(choice)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }
  return (
    <LumenFrame as="section" className="hbar-web-general-settings">
      <LumenFrame as="header" className="hbar-web-general-heading">
        <LumenFrame>
          <LumenText as="h2">{labels.title}</LumenText>
          <LumenText as="p" tone="muted" variant="supporting">
            {labels.description}
          </LumenText>
        </LumenFrame>
        <LumenText as="p" tone="subtle" variant="supporting">
          {labels.deviceScope}
        </LumenText>
      </LumenFrame>
      <LumenFrame as="fieldset" className="hbar-web-general-language">
        <LumenText as="legend" id="hbar-general-language-label" variant="label">
          {labels.language}
        </LumenText>
        <LumenText as="p" id="hbar-general-language-help" tone="muted" variant="supporting">
          {labels.languageDescription}
        </LumenText>
        <LumenFrame
          role="radiogroup"
          aria-labelledby="hbar-general-language-label"
          aria-describedby="hbar-general-language-help"
          className="hbar-web-general-choices"
          ref={choices}
        >
          {WEB_LANGUAGE_CHOICES.map((choice, index) => (
            <LumenButton
              key={choice}
              variant="outlined"
              indicator="none"
              role="radio"
              aria-checked={state.preference === choice}
              tabIndex={state.preference === choice ? 0 : -1}
              onClick={() => language.select(choice)}
              onKeyDown={(event) => chooseWithKeyboard(event, index)}
            >
              {labels.options[choice]}
            </LumenButton>
          ))}
        </LumenFrame>
        <LumenText as="p" tone="muted" variant="supporting">
          {labels.currentLanguage(state.locale)}
        </LumenText>
        {state.preference === 'system' && (
          <LumenText as="p" tone="muted" variant="supporting">
            {labels.systemPolicy}
          </LumenText>
        )}
        <LumenFrame className="hbar-web-general-feedback">
          {state.status === 'saved' && (
            <LumenText as="p" role="status" variant="supporting">
              {labels.saved}
            </LumenText>
          )}
          {state.status === 'read-error' && (
            <>
              <LumenText as="p" role="alert" variant="supporting">
                {labels.readError(state.error ?? 'STORAGE_UNAVAILABLE')}
              </LumenText>
              <LumenButton variant="text" indicator="none" onClick={(event) => retry(event, language.refresh)}>
                {labels.retryRead}
              </LumenButton>
            </>
          )}
          {state.status === 'save-error' && (
            <>
              <LumenText as="p" role="alert" variant="supporting">
                {labels.saveError}
              </LumenText>
              <LumenButton variant="text" indicator="none" onClick={(event) => retry(event, language.persist)}>
                {labels.retrySave}
              </LumenButton>
            </>
          )}
        </LumenFrame>
      </LumenFrame>
      {sendBehavior && (
        <WebGeneralSendBehavior labels={labels.sending} controller={sendBehavior} connected={connected} />
      )}
    </LumenFrame>
  )
}
