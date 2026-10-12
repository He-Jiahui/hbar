'use client'

import * as React from 'react'
import LumenField from '../LumenField'
import LumenIndicator from '../LumenIndicator'
import LumenSurface from '../LumenSurface'
import { LumenFileButton, LumenInput } from '../forms'
import { LumenButton, LumenNavigationButton } from '../primitives'
import { LumenProgress } from '../ui-controls'
import { LumenIcon } from '../workbench'
import type {
  FileManagerItem,
  HbarAppUiFileManager01Props,
  HbarAppUiFileManager02Props,
  HbarAppUiFileManager03Props,
  HbarAppUiFileManager04Props,
} from './fileManagerTypes'
import styles from './file-manager.module.css'

export type {
  FileManagerTransfer,
  HbarAppUiFileManager01Props,
  HbarAppUiFileManager02Props,
  HbarAppUiFileManager03Props,
  HbarAppUiFileManager04Props,
} from './fileManagerTypes'

function unique<Item extends { id: string }>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  return items.filter(({ id }) => {
    if (seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
}

function Frame({
  id,
  title,
  detail,
  children,
}: {
  id: string
  title: string
  detail: string
  children: React.ReactNode
}) {
  return (
    <LumenSurface className={styles.surface} data-hbar-app-ui-variant={id}>
      <section className={styles.frame} aria-labelledby={`${id}-title`}>
        <header className={styles.header}>
          <div>
            <h2 id={`${id}-title`}>{title}</h2>
            <p>{detail}</p>
          </div>
          <LumenIndicator edge="left" state="selected" />
        </header>
        {children}
      </section>
    </LumenSurface>
  )
}

function Action({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean | undefined
}) {
  return (
    <LumenButton
      className={styles.action}
      variant="outlined"
      indicatorState="idle"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </LumenButton>
  )
}

function FileRow({ item, selected, onClick }: { item: FileManagerItem; selected: boolean; onClick: () => void }) {
  return (
    <LumenNavigationButton className={styles.fileRow} selected={selected} indicatorEdge="right" onClick={onClick}>
      <span>
        <strong>{item.name}</strong>
        <small>{item.description}</small>
      </span>
      <span className={styles.updated}>{item.updated}</span>
    </LumenNavigationButton>
  )
}

function FolderGlyph(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 20 20">
      <path d="M2.5 5.5h6l1.5 2h7.5v8h-15z" />
    </svg>
  )
}

function FileGlyph(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 20 20">
      <path d="M5 2.5h6l4 4v11H5z" />
      <path d="M11 2.5v4h4M7.5 10h5M7.5 13h5" />
    </svg>
  )
}

function AssetGlyph({ folder }: { folder: boolean }) {
  return <LumenIcon icon={folder ? FolderGlyph : FileGlyph} tier="lg" />
}

export function HbarAppUiFileManager01({ copy, content, state, actions }: HbarAppUiFileManager01Props) {
  const query = state.query.toLocaleLowerCase().trim()
  const files = unique(content.files).filter((item) => item.name.toLocaleLowerCase().includes(query))
  return (
    <Frame id="hbar-app-ui-file-manager-1" title={copy.title} detail={copy.detail}>
      <div className={styles.drive}>
        <nav className={styles.folders} aria-label={copy.folders}>
          <h3>{copy.folders}</h3>
          {unique(content.folders).map((folder) => (
            <LumenNavigationButton
              key={folder.id}
              selected={folder.id === state.folderId}
              indicatorEdge="right"
              onClick={() => actions.onFolder(content.id, folder.id)}
            >
              {folder.label}
            </LumenNavigationButton>
          ))}
          <div className={styles.storage}>
            <span>{copy.storage(content.storage.used, content.storage.total)}</span>
            <LumenProgress
              label={copy.storage(content.storage.used, content.storage.total)}
              value={content.storage.percent}
            />
          </div>
        </nav>
        <div className={styles.driveMain}>
          <div className={styles.toolbar}>
            <LumenField boundary="vertical" className={styles.query}>
              <LumenInput
                size="s"
                value={state.query}
                placeholder={copy.search}
                aria-label={copy.search}
                onChange={(event) => actions.onQuery(content.id, event.target.value)}
              />
            </LumenField>
            <LumenFileButton
              label={copy.upload}
              accept={content.accept}
              multiple
              onFiles={(files) => actions.onUpload(content.id, files)}
            />
          </div>
          <section className={styles.suggested} aria-label={copy.suggested}>
            <h3>{copy.suggested}</h3>
            <div className={styles.cards}>
              {unique(content.suggested).map((item) => (
                <FileRow
                  key={item.id}
                  item={item}
                  selected={state.selectedId === item.id}
                  onClick={() => actions.onFile(content.id, item.id)}
                />
              ))}
            </div>
          </section>
          <section className={styles.files} aria-label={copy.files}>
            <h3>{copy.files}</h3>
            {files.length === 0 && <p>{copy.empty}</p>}
            {files.map((item) => (
              <FileRow
                key={item.id}
                item={item}
                selected={state.selectedId === item.id}
                onClick={() => actions.onFile(content.id, item.id)}
              />
            ))}
          </section>
        </div>
      </div>
    </Frame>
  )
}

export function HbarAppUiFileManager02({ copy, content, state, actions }: HbarAppUiFileManager02Props) {
  const assets = unique(content.assets).filter(
    (item) => !state.filterId || state.filterId === 'all' || item.kind === state.filterId,
  )
  const validIds = new Set(assets.map((item) => item.id))
  const selected = state.selectedIds.filter((id) => validIds.has(id))
  return (
    <Frame id="hbar-app-ui-file-manager-2" title={copy.title} detail={copy.detail}>
      <nav className={styles.breadcrumbs} aria-label={copy.title}>
        {unique(content.breadcrumbs).map((item) => (
          <Action key={item.id} onClick={() => actions.onBreadcrumb(content.id, item.id)}>
            {item.label}
          </Action>
        ))}
      </nav>
      <div className={styles.filter} role="group" aria-label={copy.filter}>
        {unique(content.filters).map((item) => (
          <LumenButton
            key={item.id}
            variant="text"
            indicatorState={item.id === state.filterId ? 'selected' : undefined}
            aria-pressed={item.id === state.filterId}
            onClick={() => actions.onFilter(content.id, item.id)}
          >
            {item.label}
          </LumenButton>
        ))}
      </div>
      <div className={styles.assetGrid}>
        {assets.length === 0 && <p>{copy.empty}</p>}
        {assets.map((item) => (
          <article key={item.id} className={styles.asset}>
            <LumenButton
              variant="text"
              indicatorState={selected.includes(item.id) ? 'selected' : undefined}
              aria-pressed={selected.includes(item.id)}
              onClick={() => actions.onSelect(content.id, item.id)}
            >
              <AssetGlyph folder={item.kind === 'folder'} />
              <strong>{item.name}</strong>
              <small>{item.description}</small>
            </LumenButton>
            <Action onClick={() => actions.onOpen(content.id, item.id)}>{copy.open}</Action>
          </article>
        ))}
      </div>
      {selected.length > 0 && (
        <p className={styles.selection} role="status">
          {copy.selection(selected.length)}
        </p>
      )}
    </Frame>
  )
}

export function HbarAppUiFileManager03({ copy, content, state, actions }: HbarAppUiFileManager03Props) {
  const items = unique(content.files)
  const selected = items.find((item) => item.id === state.selectedId) ?? items[0]
  return (
    <Frame id="hbar-app-ui-file-manager-3" title={copy.title} detail={copy.detail}>
      <div className={styles.detailLayout}>
        <nav className={styles.detailList} aria-label={copy.files}>
          {items.length === 0 && <p>{copy.empty}</p>}
          {items.map((item) => (
            <FileRow
              key={item.id}
              item={item}
              selected={selected?.id === item.id}
              onClick={() => actions.onSelect(content.id, item.id)}
            />
          ))}
        </nav>
        {selected && (
          <section className={styles.preview} aria-label={copy.preview}>
            <h3>{selected.name}</h3>
            <p className={styles.previewText}>{selected.preview}</p>
            <div className={styles.toolbar}>
              <Action disabled={state.busy} onClick={() => actions.onShare(content.id, selected.id)}>
                {copy.share}
              </Action>
              <Action disabled={state.busy} onClick={() => actions.onDownload(content.id, selected.id)}>
                {copy.download}
              </Action>
            </div>
            {state.error && (
              <div role="alert" className={styles.alert}>
                <span>{state.error}</span>
                <Action onClick={() => actions.onRetry(content.id, selected.id)}>{copy.retry}</Action>
              </div>
            )}
            <h3>{copy.metadata}</h3>
            <dl className={styles.metadata}>
              {unique(selected.metadata).map((item) => (
                <div key={item.id}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
            <h3>{copy.collaborators}</h3>
            <div className={styles.pills}>
              {unique(selected.collaborators).map((item) => (
                <span key={item.id}>{item.label}</span>
              ))}
            </div>
            <h3>{copy.activity}</h3>
            <ol className={styles.activity}>
              {unique(selected.activity).map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </Frame>
  )
}

export function HbarAppUiFileManager04({ copy, content, actions }: HbarAppUiFileManager04Props) {
  const [dragging, setDragging] = React.useState(false)
  const transfers = unique(content.transfers)
  const finished = transfers.filter((item) => item.status === 'ready').length
  return (
    <Frame id="hbar-app-ui-file-manager-4" title={copy.title} detail={copy.detail}>
      <div
        className={styles.dropzone}
        data-lumen-dropzone
        data-dragging={dragging}
        onDragEnter={() => setDragging(true)}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDragging(false)
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const files = Array.from(event.dataTransfer.files)
          if (files.length) {
            actions.onUpload(content.id, files, 'drop')
          }
        }}
      >
        <strong>{dragging ? copy.release : copy.drop}</strong>
        <LumenFileButton
          label={copy.choose}
          accept={content.accept}
          multiple={content.multiple}
          onFiles={(files) => actions.onUpload(content.id, files, 'picker')}
        />
      </div>
      <p role="status">{copy.summary(finished, transfers.length)}</p>
      <div className={styles.transfers} aria-label={copy.title}>
        {transfers.length === 0 && <p>{copy.empty}</p>}
        {transfers.map((item) => (
          <article key={item.id} className={styles.transfer}>
            <div>
              <strong>{item.name}</strong>
              <small>{copy.status[item.status]}</small>
            </div>
            <LumenProgress label={copy.progress(item.name, item.progress)} value={item.progress} />
            <span>{copy.percentage(item.progress)}</span>
            {item.status === 'failed' && (
              <Action onClick={() => actions.onRetry(content.id, item.id)}>{copy.retry(item.name)}</Action>
            )}
            {(item.status === 'uploading' || item.status === 'queued') && (
              <Action onClick={() => actions.onCancel(content.id, item.id)}>{copy.cancel(item.name)}</Action>
            )}
          </article>
        ))}
      </div>
    </Frame>
  )
}
