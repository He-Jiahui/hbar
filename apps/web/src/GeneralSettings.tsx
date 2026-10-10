import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { useStore } from 'zustand'
import { LumenContentText, LumenButton, LumenFrame, LumenRange, LumenText } from '@lumen/app-ui'
import { WEB_LANGUAGE_CHOICES, type WebLanguageController, type WebLanguagePreference } from './language'
import { WEB_SEND_BEHAVIORS, type WebSendBehavior, type WebSendBehaviorController } from './send-behavior'
import { DEFAULT_WEB_ZOOM, MAX_WEB_ZOOM, MIN_WEB_ZOOM, type WebZoomController } from './app-zoom'
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
  readonly zoom: {
    readonly title: string
    readonly description: string
    readonly shortcut: string
    readonly level: (percent: number) => string
    readonly reset: string
    readonly loading: string
    readonly saved: string
    readonly readError: string
    readonly saveError: string
    readonly applyError: string
    readonly nativeFallback: string
    readonly retryRead: string
    readonly retrySave: string
  }
}

function WebGeneralZoom({
  labels,
  controller,
  native,
}: {
  readonly labels: WebGeneralSettingsLabels['zoom']
  readonly controller: WebZoomController
  readonly native: boolean
}) {
  const state = useStore(controller.store)
  const [draft, setDraft] = useState(state.level)
  const draftRef = useRef(draft)
  const dragging = useRef(false)
  useLayoutEffect(() => {
    if (dragging.current) return
    draftRef.current = state.level
    setDraft(state.level)
  }, [state.level])
  const edit = (level: number) => {
    draftRef.current = level
    setDraft(level)
  }
  const commit = () => {
    dragging.current = false
    if (draftRef.current !== controller.store.getState().level) void controller.select(draftRef.current)
  }
  const disabled = state.status === 'loading' || state.status === 'applying'
  return (
    <LumenFrame as="fieldset" className="hbar-web-general-zoom">
      <LumenText as="legend" id="hbar-general-zoom-label" variant="label">
        {labels.title}
      </LumenText>
      <LumenContentText context="section.description" tone="muted">
        {labels.description}
      </LumenContentText>
      <LumenContentText context="section.description" tone="subtle">
        {labels.shortcut}
      </LumenContentText>
      <LumenFrame className="hbar-web-general-zoom-control">
        <LumenContentText context="record.title" role="status">
          {labels.level(Math.round(draft * 100))}
        </LumenContentText>
        <LumenButton
          variant="text"
          size="s"
          disabled={disabled || (state.level === DEFAULT_WEB_ZOOM && draft === DEFAULT_WEB_ZOOM)}
          onClick={() => void controller.select(DEFAULT_WEB_ZOOM)}
        >
          {labels.reset}
        </LumenButton>
      </LumenFrame>
      <LumenFrame className="hbar-web-general-zoom-range">
        <LumenContentText context="metadata">{labels.level(MIN_WEB_ZOOM * 100)}</LumenContentText>
        <LumenRange
          aria-labelledby="hbar-general-zoom-label"
          aria-valuetext={labels.level(Math.round(draft * 100))}
          min={MIN_WEB_ZOOM}
          max={MAX_WEB_ZOOM}
          step={0.01}
          value={draft}
          disabled={disabled}
          onPointerDown={() => {
            dragging.current = true
          }}
          onPointerUp={commit}
          onPointerCancel={() => {
            dragging.current = false
            edit(state.level)
          }}
          onChange={(event) => edit(Number(event.currentTarget.value))}
          onKeyUp={(event) => {
            if (
              ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(
                event.key,
              )
            )
              commit()
          }}
          onBlur={commit}
        />
        <LumenContentText context="metadata">{labels.level(MAX_WEB_ZOOM * 100)}</LumenContentText>
      </LumenFrame>
      {state.status === 'loading' && (
        <LumenContentText context="message.inline" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {state.status === 'saved' && (
        <LumenContentText context="message.inline" role="status">
          {labels.saved}
        </LumenContentText>
      )}
      {state.status === 'read-error' && (
        <LumenFrame className="hbar-web-general-feedback">
          <LumenContentText context="message.inline" role="alert">
            {labels.readError}
          </LumenContentText>
          <LumenButton variant="text" onClick={() => void controller.refresh()}>
            {labels.retryRead}
          </LumenButton>
        </LumenFrame>
      )}
      {state.status === 'save-error' && (
        <LumenFrame className="hbar-web-general-feedback">
          <LumenContentText context="message.inline" role="alert">
            {labels.saveError}
          </LumenContentText>
          <LumenButton variant="text" onClick={() => void controller.persist()}>
            {labels.retrySave}
          </LumenButton>
        </LumenFrame>
      )}
      {state.status === 'apply-error' && (
        <LumenContentText context="message.inline" role="alert">
          {labels.applyError}
        </LumenContentText>
      )}
      {native && state.mode === 'css' && (
        <LumenContentText context="message.inline" role="status">
          {labels.nativeFallback}
        </LumenContentText>
      )}
    </LumenFrame>
  )
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
  const recover = (_event: MouseEvent<HTMLButtonElement>, action: () => Promise<void>) => {
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
      <LumenContentText context="section.description" id="hbar-general-sending-help" tone="muted">
        {labels.description}
      </LumenContentText>
      <LumenContentText context="section.description" tone="subtle">
        {labels.hostScope}
      </LumenContentText>
      <LumenFrame
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
            <LumenContentText context="control.label" className="hbar-web-general-send-title">
              {labels.options[behavior].label}
            </LumenContentText>
            <LumenContentText context="choice.description" tone="muted">
              {labels.options[behavior].description}
            </LumenContentText>
          </LumenButton>
        ))}
      </LumenFrame>
      {state.status === 'loading' && (
        <LumenContentText context="message.inline" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {state.status === 'saved' && (
        <LumenContentText context="message.inline" role="status">
          {labels.saved}
        </LumenContentText>
      )}
      {state.status === 'unsupported' && (
        <LumenContentText context="message.inline" role="alert">
          {labels.unsupported}
        </LumenContentText>
      )}
      {state.status === 'read-error' && (
        <LumenFrame className="hbar-web-general-feedback">
          <LumenContentText context="message.inline" role="alert">
            {labels.readError(state.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenButton disabled={!connected} onClick={(event) => recover(event, controller.refresh)}>
            {labels.retryRead}
          </LumenButton>
        </LumenFrame>
      )}
      {state.status === 'save-error' && (
        <LumenFrame className="hbar-web-general-feedback">
          <LumenContentText context="message.inline" role="alert">
            {labels.saveError(state.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenButton disabled={!connected} onClick={(event) => recover(event, controller.refresh)}>
            {labels.retryRead}
          </LumenButton>
        </LumenFrame>
      )}
      {state.status === 'unknown' && (
        <LumenFrame className="hbar-web-general-feedback">
          <LumenContentText context="message.inline" role="alert">
            {labels.unknown}
          </LumenContentText>
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
  zoom,
  nativeZoom = false,
  connected = true,
}: {
  readonly labels: WebGeneralSettingsLabels
  readonly language: WebLanguageController
  readonly sendBehavior?: WebSendBehaviorController | undefined
  readonly zoom?: WebZoomController | undefined
  readonly nativeZoom?: boolean | undefined
  readonly connected?: boolean | undefined
}) {
  const state = useStore(language.store)
  const retry = (_event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    action()
  }
  return (
    <LumenFrame as="section" className="hbar-web-general-settings">
      <LumenFrame as="header" className="hbar-web-general-heading">
        <LumenFrame>
          <LumenContentText context="section.title">{labels.title}</LumenContentText>
          <LumenContentText context="section.description" tone="muted">
            {labels.description}
          </LumenContentText>
        </LumenFrame>
        <LumenContentText context="section.description" tone="subtle">
          {labels.deviceScope}
        </LumenContentText>
      </LumenFrame>
      <LumenFrame as="fieldset" className="hbar-web-general-language">
        <LumenText as="legend" id="hbar-general-language-label" variant="label">
          {labels.language}
        </LumenText>
        <LumenContentText context="section.description" id="hbar-general-language-help" tone="muted">
          {labels.languageDescription}
        </LumenContentText>
        <LumenFrame
          role="radiogroup"
          aria-labelledby="hbar-general-language-label"
          aria-describedby="hbar-general-language-help"
          className="hbar-web-general-choices"
        >
          {WEB_LANGUAGE_CHOICES.map((choice) => (
            <LumenButton
              key={choice}
              variant="outlined"
              indicator="none"
              role="radio"
              aria-checked={state.preference === choice}
              tabIndex={state.preference === choice ? 0 : -1}
              onClick={() => language.select(choice)}
            >
              {labels.options[choice]}
            </LumenButton>
          ))}
        </LumenFrame>
        <LumenContentText context="section.description" tone="muted">
          {labels.currentLanguage(state.locale)}
        </LumenContentText>
        {state.preference === 'system' && (
          <LumenContentText context="section.description" tone="muted">
            {labels.systemPolicy}
          </LumenContentText>
        )}
        <LumenFrame className="hbar-web-general-feedback">
          {state.status === 'saved' && (
            <LumenContentText context="feedback.message" role="status">
              {labels.saved}
            </LumenContentText>
          )}
          {state.status === 'read-error' && (
            <>
              <LumenContentText context="feedback.message" role="alert">
                {labels.readError(state.error ?? 'STORAGE_UNAVAILABLE')}
              </LumenContentText>
              <LumenButton variant="text" indicator="none" onClick={(event) => retry(event, language.refresh)}>
                {labels.retryRead}
              </LumenButton>
            </>
          )}
          {state.status === 'save-error' && (
            <>
              <LumenContentText context="feedback.message" role="alert">
                {labels.saveError}
              </LumenContentText>
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
      {zoom && <WebGeneralZoom labels={labels.zoom} controller={zoom} native={nativeZoom} />}
    </LumenFrame>
  )
}
