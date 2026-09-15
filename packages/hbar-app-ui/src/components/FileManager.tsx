import type {HbarAppUiVariantProps} from '../types'
import {AssetLibrary} from './file-manager/AssetLibrary'
import {FileDetail} from './file-manager/FileDetail'
import {DriveExplorer} from './file-manager/DriveExplorer'
import {HbarAppUiFileManagerProvider, useHbarAppUiFileManagerContent} from './file-manager/FileManagerContent'
import {UploadQueue} from './file-manager/UploadQueue'

export {HbarAppUiFileManagerProvider}
export type {
    HbarAppUiFileKind,
    HbarAppUiFileManagerAsset,
    HbarAppUiFileManagerAssetContent,
    HbarAppUiFileManagerActivity,
    HbarAppUiFileManagerCollaborator,
    HbarAppUiFileManagerContent,
    HbarAppUiFileManagerDetailContent,
    HbarAppUiFileManagerDetailItem,
    HbarAppUiFileManagerDriveContent,
    HbarAppUiFileManagerDriveRow,
    HbarAppUiFileManagerFolder,
    HbarAppUiFileManagerListStrategy,
    HbarAppUiFileManagerMetadata,
    HbarAppUiFileManagerOwner,
    HbarAppUiFileManagerProviderProps,
    HbarAppUiFileManagerUploadContent,
    HbarAppUiFileManagerUploadItem,
    HbarAppUiFileManagerUploadState,
} from './file-manager/FileManagerContent'
export {selectHbarAppUiFileManagerItem, uniqueHbarAppUiFileManagerItems} from './file-manager/FileManagerContent'

function EmptyFileManagerSurface({spec}: Pick<HbarAppUiVariantProps, 'spec'>) {
    return <section className="hbar-app-ui-variant hbar-app-ui-file-manager-surface hbar-app-ui-file-manager-empty-surface" data-hbar-app-ui-component={spec.id} data-hbar-app-ui-state={spec.profile.initialState} />
}

/** Each file-management pattern renders from host-owned, locale-aware content. */
export function FileManager({spec, onAction}: HbarAppUiVariantProps) {
    const content = useHbarAppUiFileManagerContent()
    if (!content) return <EmptyFileManagerSurface spec={spec} />
    switch (spec.variant) {
        case 1:
            return content.drive ? <DriveExplorer spec={spec} onAction={onAction} content={content.drive} /> : <EmptyFileManagerSurface spec={spec} />
        case 2:
            return content.assets ? <AssetLibrary spec={spec} onAction={onAction} content={content.assets} /> : <EmptyFileManagerSurface spec={spec} />
        case 3:
            return content.detail ? <FileDetail spec={spec} onAction={onAction} content={content.detail} /> : <EmptyFileManagerSurface spec={spec} />
        case 4:
            return content.upload ? <UploadQueue spec={spec} onAction={onAction} content={content.upload} /> : <EmptyFileManagerSurface spec={spec} />
        default:
            return <EmptyFileManagerSurface spec={spec} />
    }
}
