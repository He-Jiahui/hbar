import { useState } from 'react'
import { HbarAppUiWorkspaceFiles, HbarAppUiFileDocument } from 'hbar-app-ui'
import {
  WORKSPACE_FILE_LABELS,
  WORKSPACE_FILE_ROWS,
  WORKSPACE_FILE_SOURCES,
} from '../../../tests/fixtures/hbar-app-ui-workspace-files-fixtures'

export function FilePreviewHost() {
  const [path, setPath] = useState('.')
  const [selected, setSelected] = useState<string | undefined>()
  const rows =
    path === '.'
      ? WORKSPACE_FILE_ROWS
      : Object.keys(WORKSPACE_FILE_SOURCES)
          .filter((id) => id.startsWith(`${path}/`))
          .map((id) => ({ id, name: id.slice(path.length + 1), directory: false }))
  return (
    <div className="hbar-app-ui-shell-preview-body">
      <HbarAppUiWorkspaceFiles
        path={path}
        items={rows}
        loading={false}
        labels={WORKSPACE_FILE_LABELS}
        onParent={() => setPath('.')}
        onRefresh={() => setSelected(undefined)}
        onOpen={(id) => {
          if (rows.find((row) => row.id === id)?.directory) setPath(id)
          else setSelected(id)
        }}
      />
      {selected && (
        <HbarAppUiFileDocument
          path={selected}
          loading={false}
          labels={WORKSPACE_FILE_LABELS}
          onRetry={() => setSelected(selected)}
        >
          <pre>{WORKSPACE_FILE_SOURCES[selected]}</pre>
        </HbarAppUiFileDocument>
      )}
    </div>
  )
}
