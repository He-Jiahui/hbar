import type { ArtifactRef } from '@hbar/contracts'

export interface ComposerDraft {
  text: string
  images: ArtifactRef[]
  files: ArtifactRef[]
}

export const EMPTY_COMPOSER_DRAFT: ComposerDraft = { text: '', images: [], files: [] }

const MAX_DRAFTS = 200
const MAX_TEXT_LENGTH = 200_000
const MAX_ATTACHMENTS = 12

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isArtifactRef(value: unknown): value is ArtifactRef {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    /^[a-f0-9]{64}$/.test(value.id) &&
    typeof value.name === 'string' &&
    value.name.length <= 240 &&
    typeof value.mime === 'string' &&
    value.mime.length <= 120 &&
    typeof value.size === 'number' &&
    Number.isInteger(value.size) &&
    value.size >= 0
  )
}

function attachments(value: unknown): ArtifactRef[] {
  if (!Array.isArray(value)) return []
  return value.filter(isArtifactRef).slice(0, MAX_ATTACHMENTS).map((artifact) => ({ ...artifact }))
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT_LENGTH) : ''
}

/** Converts persisted v3 text drafts and malformed local data into a bounded composer model. */
export function normalizeComposerDraft(value: unknown): ComposerDraft {
  if (typeof value === 'string') return { text: text(value), images: [], files: [] }
  if (!isRecord(value)) return { ...EMPTY_COMPOSER_DRAFT }
  const images = attachments(value.images)
  return {
    text: text(value.text),
    images,
    files: attachments(value.files).slice(0, MAX_ATTACHMENTS - images.length),
  }
}

export function composerDraftKey(sessionId: string | undefined): string {
  return sessionId || 'new'
}

export function normalizeComposerDrafts(value: unknown): Record<string, ComposerDraft> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([sessionId]) => sessionId === 'new' || (sessionId.length > 0 && sessionId.length <= 160))
      .slice(0, MAX_DRAFTS)
      .map(([sessionId, draft]) => [sessionId, normalizeComposerDraft(draft)]),
  )
}

/**
 * Acknowledges only the draft captured for a submitted run. A newer draft is
 * kept intact, except for attachments that were part of the submitted copy.
 */
export function acknowledgeComposerDraftValue(current: ComposerDraft, sent: ComposerDraft): ComposerDraft | null {
  const sameText = current.text === sent.text
  const sameImages = sameArtifactIds(current.images, sent.images)
  const sameFiles = sameArtifactIds(current.files, sent.files)
  if (sameText && sameImages && sameFiles) return null
  const sentIds = new Set([...sent.images, ...sent.files].map((artifact) => artifact.id))
  return normalizeComposerDraft({
    ...current,
    images: current.images.filter((artifact) => !sentIds.has(artifact.id)),
    files: current.files.filter((artifact) => !sentIds.has(artifact.id)),
  })
}

function sameArtifactIds(left: ArtifactRef[], right: ArtifactRef[]): boolean {
  return left.length === right.length && left.every((artifact, index) => artifact.id === right[index]?.id)
}
