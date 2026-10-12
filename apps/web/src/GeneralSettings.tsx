import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { useStore } from 'zustand'
import { createMessageScope } from '@hbar/app-react'
import { LumenContentText, LumenButton, LumenFrame, LumenRange, LumenText, LumenToggleGroup } from '@lumen/app-ui'
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

const WebGeneralSettingsMessages = createMessageScope<WebGeneralSettingsLabels>()

function WebGeneralZoom({
  controller,
  native,
}: {
  readonly controller: WebZoomController
  readonly native: boolean
}) {
  const { t } = WebGeneralSettingsMessages.useMessages()
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
        {t('zoom').title}
      </LumenText>
      <LumenContentText context="section.description" tone="muted">
        {t('zoom').description}
      </LumenContentText>
      <LumenContentText context="section.description" tone="subtle">
        {t('zoom').shortcut}
      </LumenContentText>
      <LumenFrame className="hbar-web-general-zoom-control">
        <LumenContentText context="record.title" role="status">
          {t('zoom').level(Math.round(draft * 100))}
        </LumenContentText>
        <LumenButton
          variant="text"
          size="s"
          disabled={disabled || (state.level === DEFAULT_WEB_ZOOM && draft === DEFAULT_WEB_ZOOM)}
          onClick={() => void controller.select(DEFAULT_WEB_ZOOM)}
        >
          {t('zoom').reset}
        </LumenButton>
      </LumenFrame>
      <LumenFrame className="hbar-web-general-zoom-range">
        <LumenContentText context="metadata">{t('zoom').level(MIN_WEB_ZOOM * 100)}</LumenContentText>
        <LumenRange
          aria-labelledby="hbar-general-zoom-label"
          aria-valuetext={t('zoom').level(Math.round(draft * 100))}
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
        <LumenContentText context="metadata">{t('zoom').level(MAX_WEB_ZOOM * 100)}</LumenContentText>
      </LumenFrame>
      {state.status === 'loading' && (
        <LumenContentText context="message.inline" role="status">
          {t('zoom').loading}
        </LumenContentText>
      )}
      {state.status === 'saved' && (
        <LumenContentText context="message.inline" role="status">
          {t('zoom').saved}
        </LumenContentText>
      )}
      {state.status === 'read-error' && (
        <LumenFrame className="hbar-web-general-feedback">
          <LumenContentText context="message.inline" role="alert">
            {t('zoom').readError}
          </LumenContentText>
          <LumenButton variant="text" onClick={() => void controller.refresh()}>
            {t('zoom').retryRead}
          </LumenButton>
        </LumenFrame>
      )}
      {state.status === 'save-error' && (
        <LumenFrame className="hbar-web-general-feedback">
          <LumenContentText context="message.inline" role="alert">
            {t('zoom').saveError}
          </LumenContentText>
          <LumenButton variant="text" onClick={() => void controller.persist()}>
            {t('zoom').retrySave}
          </LumenButton>
        </LumenFrame>
      )}
      {state.status === 'apply-error' && (
        <LumenContentText context="message.inline" role="alert">
          {t('zoom').applyError}
        </LumenContentText>
      )}
      {native && state.mode === 'css' && (
        <LumenContentText context="message.inline" role="status">
          {t('zoom').nativeFallback}
        </LumenContentText>
      )}
    </LumenFrame>
  )
}

function WebGeneralSendBehavior({
  controller,
  connected,
}: {
  readonly controller: WebSendBehaviorController
  readonly connected: boolean
}) {
  const { t } = WebGeneralSettingsMessages.useMessages()
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
        {t('sending').title}
      </LumenText>
      <LumenContentText context="section.description" id="hbar-general-sending-help" tone="muted">
        {t('sending').description}
      </LumenContentText>
      <LumenContentText context="section.description" tone="subtle">
        {t('sending').hostScope}
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
              {t('sending').options[behavior].label}
            </LumenContentText>
            <LumenContentText context="choice.description" tone="muted">
              {t('sending').options[behavior].description}
            </LumenContentText>
          </LumenButton>
        ))}
      </LumenFrame>
      {state.status === 'loading' && (
        <LumenContentText context="message.inline" role="status">
          {t('sending').loading}
        </LumenContentText>
      )}
      {state.status === 'saved' && (
        <LumenContentText context="message.inline" role="status">
          {t('sending').saved}
        </LumenContentText>
      )}
      {state.status === 'unsupported' && (
        <LumenContentText context="message.inline" role="alert">
          {t('sending').unsupported}
        </LumenContentText>
      )}
      {state.status === 'read-error' && (
        <LumenFrame className="hbar-web-general-feedback">
          <LumenContentText context="message.inline" role="alert">
            {t('sending').readError(state.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenButton disabled={!connected} onClick={(event) => recover(event, controller.refresh)}>
            {t('sending').retryRead}
          </LumenButton>
        </LumenFrame>
      )}
      {state.status === 'save-error' && (
        <LumenFrame className="hbar-web-general-feedback">
          <LumenContentText context="message.inline" role="alert">
            {t('sending').saveError(state.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenButton disabled={!connected} onClick={(event) => recover(event, controller.refresh)}>
            {t('sending').retryRead}
          </LumenButton>
        </LumenFrame>
      )}
      {state.status === 'unknown' && (
        <LumenFrame className="hbar-web-general-feedback">
          <LumenContentText context="message.inline" role="alert">
            {t('sending').unknown}
          </LumenContentText>
          <LumenButton disabled={!connected} onClick={(event) => recover(event, controller.reconcile)}>
            {t('sending').recheck}
          </LumenButton>
          <LumenButton disabled={!connected} onClick={(event) => recover(event, controller.retry)}>
            {t('sending').retryOriginal}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

interface WebGeneralSettingsProps {
  readonly labels: WebGeneralSettingsLabels
  readonly language: WebLanguageController
  readonly sendBehavior?: WebSendBehaviorController | undefined
  readonly zoom?: WebZoomController | undefined
  readonly nativeZoom?: boolean | undefined
  readonly connected?: boolean | undefined
}

function WebGeneralSettingsView({
  language,
  sendBehavior,
  zoom,
  nativeZoom = false,
  connected = true,
}: Omit<WebGeneralSettingsProps, 'labels'>) {
  const { t } = WebGeneralSettingsMessages.useMessages()
  const state = useStore(language.store)
  const languageChoices = useRef<HTMLDivElement>(null)
  const retry = (_event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    action()
    const selected = language.store.getState().preference
    languageChoices.current?.querySelector<HTMLButtonElement>(`[role="radio"][data-value="${selected}"]`)?.focus()
  }
  return (
    <LumenFrame as="section" className="hbar-web-general-settings">
      <LumenFrame as="header" className="hbar-web-general-heading">
        <LumenFrame>
          <LumenContentText context="section.title">{t('title')}</LumenContentText>
          <LumenContentText context="section.description" tone="muted">
            {t('description')}
          </LumenContentText>
        </LumenFrame>
        <LumenContentText context="section.description" tone="subtle">
          {t('deviceScope')}
        </LumenContentText>
      </LumenFrame>
      <LumenFrame as="fieldset" className="hbar-web-general-language">
        <LumenText as="legend" id="hbar-general-language-label" variant="label">
          {t('language')}
        </LumenText>
        <LumenContentText context="section.description" id="hbar-general-language-help" tone="muted">
          {t('languageDescription')}
        </LumenContentText>
        <LumenToggleGroup
          ref={languageChoices}
          type="single"
          value={state.preference}
          options={WEB_LANGUAGE_CHOICES.map((choice) => ({ id: choice, label: t('options')[choice] }))}
          onValueChange={(value) => {
            if (value === 'system' || value === 'zh-CN' || value === 'en-US') language.select(value)
          }}
          aria-labelledby="hbar-general-language-label"
          aria-describedby="hbar-general-language-help"
          className="hbar-web-general-choices"
        />
        <LumenContentText context="section.description" tone="muted">
          {t('currentLanguage')(state.locale)}
        </LumenContentText>
        {state.preference === 'system' && (
          <LumenContentText context="section.description" tone="muted">
            {t('systemPolicy')}
          </LumenContentText>
        )}
        <LumenFrame className="hbar-web-general-feedback">
          {state.status === 'saved' && (
            <LumenContentText context="feedback.message" role="status">
              {t('saved')}
            </LumenContentText>
          )}
          {state.status === 'read-error' && (
            <>
              <LumenContentText context="feedback.message" role="alert">
                {t('readError')(state.error ?? 'STORAGE_UNAVAILABLE')}
              </LumenContentText>
              <LumenButton variant="text" indicator="none" onClick={(event) => retry(event, language.refresh)}>
                {t('retryRead')}
              </LumenButton>
            </>
          )}
          {state.status === 'save-error' && (
            <>
              <LumenContentText context="feedback.message" role="alert">
                {t('saveError')}
              </LumenContentText>
              <LumenButton variant="text" indicator="none" onClick={(event) => retry(event, language.persist)}>
                {t('retrySave')}
              </LumenButton>
            </>
          )}
        </LumenFrame>
      </LumenFrame>
      {sendBehavior && (
        <WebGeneralSendBehavior controller={sendBehavior} connected={connected} />
      )}
      {zoom && <WebGeneralZoom controller={zoom} native={nativeZoom} />}
    </LumenFrame>
  )
}

export function WebGeneralSettings({ labels, ...props }: WebGeneralSettingsProps) {
  return (
    <WebGeneralSettingsMessages.Provider messages={labels}>
      <WebGeneralSettingsView {...props} />
    </WebGeneralSettingsMessages.Provider>
  )
}
