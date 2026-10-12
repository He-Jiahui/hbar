import * as React from 'react'
import { ArrowUp, Pause, Play, X } from 'lucide-react'
import type { LumenAiChatReferenceViewProps, LumenAiChatVoiceReferenceContent } from './reference-content'
import { ReferenceFrame, uniqueReferenceItems } from './primitives'
import './reference-voice.css'

export function ReferenceVoiceChat({
  viewModel,
  variantId,
  className,
  onAction,
}: LumenAiChatReferenceViewProps<LumenAiChatVoiceReferenceContent>) {
  const { content } = viewModel
  const action = viewModel.onAction ?? onAction
  const attachments = uniqueReferenceItems(content.attachments)
  const phaseLabel = content.phase === 'listening' ? content.voiceLabels.listening : content.voiceLabels.stopped
  const statusLabel = content.subtitle ? `${phaseLabel} · ${content.subtitle}` : phaseLabel
  const setPhase = (phase: 'listening' | 'stopped') => {
    viewModel.onVoicePhaseChange?.(phase)
    action?.({ actionId: phase === 'stopped' ? 'voice-stop' : 'voice-resume' })
  }
  const send = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (content.phase === 'stopped') {
      action?.({ actionId: 'voice-send', value: content.transcript })
    }
  }
  return (
    <ReferenceFrame
      content={content}
      variantId={variantId}
      className={`lumen-ai-chat-reference-voice ${className ?? ''}`}
    >
      <header className="lumen-ai-chat-reference-header lumen-ai-chat-voice-header">
        <h1>{content.title}</h1>
        <small>{statusLabel}</small>
      </header>
      <form className="lumen-ai-chat-voice-panel" data-hbar-app-ui-region="voice-composer" onSubmit={send}>
        <section className="lumen-ai-chat-voice-waveform" aria-label={content.voiceLabels.waveform}>
          <div role="img" aria-label={content.voiceLabels.waveform}>
            {content.waveform.map((bar) => (
              <span key={bar.id} aria-hidden="true" data-level={bar.level} />
            ))}
          </div>
          <p>{content.transcript}</p>
        </section>
        <div className="lumen-ai-chat-reference-attachments lumen-ai-chat-voice-attachments">
          {attachments.map((item) => (
            <span key={item.id}>
              <span>{item.label}</span>
              <button
                type="button"
                aria-label={content.voiceLabels.remove(item.label)}
                data-hbar-app-ui-action="attachment-remove"
                data-hbar-app-ui-target={item.id}
                onClick={() => viewModel.onRemoveAttachment?.(item.id)}
              >
                <X aria-hidden="true" className="lumen-ai-chat-reference-icon" />
              </button>
            </span>
          ))}
        </div>
        {attachments.length === 0 ? (
          <p className="lumen-ai-chat-voice-empty-attachments">{content.labels.empty}</p>
        ) : null}
        <div className="lumen-ai-chat-voice-controls">
          <button
            type="button"
            data-hbar-app-ui-action={content.phase === 'listening' ? 'voice-stop' : 'voice-resume'}
            onClick={() => setPhase(content.phase === 'listening' ? 'stopped' : 'listening')}
          >
            {content.phase === 'listening' ? (
              <Pause aria-hidden="true" className="lumen-ai-chat-reference-icon" />
            ) : (
              <Play aria-hidden="true" className="lumen-ai-chat-reference-icon" />
            )}
            {content.phase === 'listening' ? content.voiceLabels.stop : content.voiceLabels.resume}
          </button>
          {content.phase === 'listening' ? <p>{content.voiceLabels.tapToStop}</p> : null}
          <button
            type="submit"
            disabled={content.phase === 'listening'}
            aria-label={content.voiceLabels.send}
            title={content.voiceLabels.send}
            data-hbar-app-ui-action="voice-send"
          >
            <ArrowUp aria-hidden="true" className="lumen-ai-chat-reference-icon" />
            {content.voiceLabels.send}
          </button>
        </div>
      </form>
    </ReferenceFrame>
  )
}
export default ReferenceVoiceChat
