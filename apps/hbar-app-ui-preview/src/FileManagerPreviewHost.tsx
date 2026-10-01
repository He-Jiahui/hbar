import { LumenFileManagerProvider } from '@lumen/app-ui'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createFileManagerPreviewStore } from './fileManagerPreviewModel'
import { createFileManagerPreviewReferenceContent } from './fileManagerPreviewReferenceFixtures'
import { createFileManagerPreviewSeed, projectFileManagerPreview } from './fileManagerPreviewProjection'

interface HostProps extends HbarAppUiVariantProps {
  readonly children: ReactNode
}
export function FileManagerPreviewHost(props: HostProps) {
  if (props.spec.category !== 'file-manager') return <>{props.children}</>
  const mode = new URLSearchParams(location.search).get('fileManagerFixture') ?? 'default'
  return <FileManagerOwner key={`${props.spec.id}:${mode}`} {...props} mode={mode} />
}
function FileManagerOwner({ spec, children, onAction, mode }: HostProps & { readonly mode: string }) {
  const ownerId = `file-manager-preview-${spec.id}`
  const input = useMemo(() => createFileManagerPreviewReferenceContent(spec.variant, mode), [spec.variant, mode])
  const seed = useMemo(
    () => createFileManagerPreviewSeed(input, spec.variant, ownerId, mode),
    [input, spec.variant, ownerId, mode],
  )
  const [store] = useState(() => createFileManagerPreviewStore(seed))
  const [simulation, setSimulation] = useState(false)
  const generation = useRef(0)
  const state = useStore(store)
  useEffect(() => {
    store.getState().refresh(seed)
  }, [store, seed])
  useEffect(() => {
    if (
      !simulation ||
      !state.open ||
      !Object.values(state.uploadsById).some(({ state: status }) => status === 'uploading')
    )
      return undefined
    const expected = ++generation.current
    const timer = setInterval(() => {
      if (generation.current === expected) store.getState().advance(ownerId)
    }, 1000)
    return () => {
      generation.current += 1
      clearInterval(timer)
    }
  }, [store, ownerId, simulation, state.open, state.uploadsById])
  const projected = projectFileManagerPreview(input, store, ({ actionId, value }) =>
    onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) }),
  )
  const reference = projected.reference
  const content = reference
    ? {
        ...projected,
        reference: {
          ...reference,
          onAction: (actionId: string, value?: string) => {
            reference.onAction(actionId, value)
            if (actionId === 'start' || actionId === 'retry') setSimulation(true)
          },
          ...(reference.kind === 'upload' && simulation
            ? {
                notice:
                  reference.notice ??
                  'Local preview transfer simulation; no files are uploaded to an external service.',
              }
            : {}),
        },
      }
    : projected
  return <LumenFileManagerProvider content={content}>{children}</LumenFileManagerProvider>
}
