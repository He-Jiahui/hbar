import {describe, expect, test} from 'bun:test'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {
    getHbarAppUiVariant,
    HbarAppUiFileManagerProvider,
    selectHbarAppUiFileManagerItem,
    uniqueHbarAppUiFileManagerItems,
    type HbarAppUiFileManagerContent,
} from '../packages/hbar-app-ui/src/index'
import {
    createHbarAppUiFileManagerLocalizedFixtures,
    HBAR_APP_UI_FILE_MANAGER_FIXTURES,
} from './fixtures/hbar-app-ui-file-manager-fixtures'

function renderFileManager(variant: number, content: HbarAppUiFileManagerContent = HBAR_APP_UI_FILE_MANAGER_FIXTURES): string {
    const component = getHbarAppUiVariant('file-manager', variant).component
    return renderToStaticMarkup(createElement(HbarAppUiFileManagerProvider, {content, children: createElement(component, {})}))
}

describe('hbar-app-ui file manager surfaces', () => {
    test('renders four independent file-management surfaces from host-owned data', () => {
        const markup = Array.from({length: 4}, (_, index) => renderFileManager(index + 1))
        expect(new Set(markup).size).toBe(4)
        expect(markup[0]).toContain('hbar-app-ui-file-manager-drive-table')
        expect(markup[1]).toContain('hbar-app-ui-file-manager-asset-grid')
        expect(markup[2]).toContain('hbar-app-ui-file-manager-detail-preview')
        expect(markup[3]).toContain('hbar-app-ui-file-manager-upload-queue')
        expect(markup[0]).toContain('aria-label="Select all files"')
        expect(markup[2]).toContain('aria-label="Activity"')
        expect(markup[3]).toContain('aria-label="Pause sizzle-30s.mp4"')
        for (const value of markup) {
            expect(value.toLowerCase()).not.toContain('react-bits')
            expect(value.toLowerCase()).not.toContain('reactbits')
        }
    })

    test('uses long host-localized copy and preserves semantic value rows', () => {
        const localized = createHbarAppUiFileManagerLocalizedFixtures()
        expect(renderFileManager(1, localized)).toContain('Halcyon-Dateiablage')
        expect(renderFileManager(2, localized)).toContain('Frühlingskampagne')
        expect(renderFileManager(3, localized)).toContain('Kundenlieferungen')
        expect(renderFileManager(4, localized)).toContain('Warteschlange')
        expect(renderFileManager(1, localized)).not.toContain('Halcyon Drive')
    })

    test('handles empty, boundary, over-bound, duplicate, and stale host records', () => {
        const drive = HBAR_APP_UI_FILE_MANAGER_FIXTURES.drive
        const assets = HBAR_APP_UI_FILE_MANAGER_FIXTURES.assets
        if (!drive || !assets) throw new Error('Expected drive and asset fixtures')
        const empty: HbarAppUiFileManagerContent = {...HBAR_APP_UI_FILE_MANAGER_FIXTURES, drive: {...drive, rows: []}, assets: {...assets, assets: []}}
        expect(renderFileManager(1, empty)).toContain('No files match this search.')
        expect(renderFileManager(2, empty)).toContain('No assets match this filter.')

        const boundary = Array.from({length: drive.listStrategy.expectedMaximum}, (_, index) => ({id: `boundary-${index}`, name: `Boundary file ${index}`, kind: 'file' as const, size: '1 KB', modified: 'Today', owner: {initials: 'BD', name: 'Boundary designer'}}))
        const overBoundary = [...boundary, {id: 'over-bound', name: 'Over-bound file', kind: 'file' as const, size: '1 KB', modified: 'Today', owner: {initials: 'OB', name: 'Over-bound designer'}}]
        expect(renderFileManager(1, {...HBAR_APP_UI_FILE_MANAGER_FIXTURES, drive: {...drive, rows: boundary}}).match(/<span>Boundary file/g)).toHaveLength(drive.listStrategy.expectedMaximum)
        expect(renderFileManager(1, {...HBAR_APP_UI_FILE_MANAGER_FIXTURES, drive: {...drive, rows: overBoundary}}).match(/<span>(?:Boundary file|Over-bound file)/g)).toHaveLength(drive.listStrategy.expectedMaximum + 1)

        const duplicate = uniqueHbarAppUiFileManagerItems([{id: 'kept', label: 'first'}, {id: 'kept', label: 'duplicate'}, {id: 'other', label: 'second'}])
        expect(duplicate).toEqual([{id: 'kept', label: 'first'}, {id: 'other', label: 'second'}])
        expect(selectHbarAppUiFileManagerItem(duplicate, 'stale')).toEqual({id: 'kept', label: 'first'})
        expect(selectHbarAppUiFileManagerItem([], 'stale')).toBeUndefined()
    })
})
