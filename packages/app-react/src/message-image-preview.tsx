import { useLayoutEffect, useRef, useState } from 'react'
import { LumenButton, LumenFrame, LumenImage, LumenText } from '@lumen/app-ui'
import { imageSourceName, remoteImageSource } from './message-image-preview-model'
import { useMessageImagePreviewLabels, type MessageImagePreviewLabels } from './message-image-preview-context'
import { registerSessionNavigationChrome } from './session-navigation-chrome'
import './message-image-preview.css'

function ImagePreview({
  source,
  name,
  labels,
}: {
  readonly source: string
  readonly name: string
  readonly labels: MessageImagePreviewLabels
}) {
  const root = useRef<HTMLSpanElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  useLayoutEffect(() => {
    const node = root.current
    return node ? registerSessionNavigationChrome(node, node) : undefined
  }, [])
  return (
    <LumenFrame as="span" ref={root} className="hbar-message-image-preview" data-image-preview-status={status}>
      <LumenFrame as="a" href={source} target="_blank" rel="noreferrer noopener" aria-label={labels.open(name)}>
        <LumenImage
          key={attempt}
          src={source}
          alt={name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          hidden={status === 'failed'}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('failed')}
        />
      </LumenFrame>
      {status === 'loading' && (
        <LumenText as="span" role="status">
          {labels.loading}
        </LumenText>
      )}
      {status === 'failed' && (
        <LumenFrame as="span" className="hbar-message-image-preview-error">
          <LumenText as="span" role="alert">
            {labels.failed}
          </LumenText>
          <LumenButton
            type="button"
            variant="text"
            indicator="none"
            size="s"
            onClick={() => {
              setStatus('loading')
              setAttempt((value) => value + 1)
            }}
          >
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

function ImageReference({
  source,
  name,
  linked,
}: {
  readonly source: string
  readonly name: string
  readonly linked: boolean
}) {
  const root = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const node = root.current
    return node ? registerSessionNavigationChrome(node, node) : undefined
  }, [])
  return (
    <LumenFrame as="span" ref={root}>
      {linked ? (
        name
      ) : (
        <LumenFrame as="a" href={source} target="_blank" rel="noreferrer noopener">
          {name}
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

/** Browser-owned lazy media loads; no Host credentials, proxy requests or product data state in the View. */
export function MessageImagePreview({
  source,
  alt,
  linked = false,
  preview = true,
}: {
  readonly source: string | undefined
  readonly alt?: string | undefined
  readonly linked?: boolean
  readonly preview?: boolean
}) {
  const labels = useMessageImagePreviewLabels()
  const url = remoteImageSource(source)
  if (!url) return alt
  const name = imageSourceName(url, alt)
  if (!preview) return <ImageReference source={url} name={name} linked={linked} />
  // An authored image inside a link retains that link's target and has no nested controls.
  if (linked || !labels)
    return (
      <LumenImage
        className="hbar-message-linked-image"
        src={url}
        alt={name}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    )
  return <ImagePreview key={url} source={url} name={name} labels={labels} />
}
