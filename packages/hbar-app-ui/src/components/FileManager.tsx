import {
  LumenFileManager,
  LumenFileManagerProvider as HbarAppUiFileManagerProvider,
  selectLumenFileManagerItem as selectHbarAppUiFileManagerItem,
  uniqueLumenFileManagerItems as uniqueHbarAppUiFileManagerItems,
  type LumenFileManagerContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiFileManagerProps = HbarAppUiVariantProps & {
  readonly fileManagerContent?: LumenFileManagerContent | undefined
}

export { HbarAppUiFileManagerProvider, selectHbarAppUiFileManagerItem, uniqueHbarAppUiFileManagerItems }

export type {
  LumenFileKind as HbarAppUiFileKind,
  LumenFileManagerActivity as HbarAppUiFileManagerActivity,
  LumenFileManagerAsset as HbarAppUiFileManagerAsset,
  LumenFileManagerAssetContent as HbarAppUiFileManagerAssetContent,
  LumenFileManagerCollaborator as HbarAppUiFileManagerCollaborator,
  LumenFileManagerContent as HbarAppUiFileManagerContent,
  LumenFileManagerDetailContent as HbarAppUiFileManagerDetailContent,
  LumenFileManagerDetailItem as HbarAppUiFileManagerDetailItem,
  LumenFileManagerDriveContent as HbarAppUiFileManagerDriveContent,
  LumenFileManagerDriveRow as HbarAppUiFileManagerDriveRow,
  LumenFileManagerFolder as HbarAppUiFileManagerFolder,
  LumenFileManagerListStrategy as HbarAppUiFileManagerListStrategy,
  LumenFileManagerMetadata as HbarAppUiFileManagerMetadata,
  LumenFileManagerOwner as HbarAppUiFileManagerOwner,
  LumenFileManagerProviderProps as HbarAppUiFileManagerProviderProps,
  LumenFileManagerUploadContent as HbarAppUiFileManagerUploadContent,
  LumenFileManagerUploadItem as HbarAppUiFileManagerUploadItem,
  LumenFileManagerUploadState as HbarAppUiFileManagerUploadState,
} from '@lumen/app-ui'

/** Thin legacy-contract adapter; file workflow rendering and interaction controls are Lumen-owned. */
export function FileManager({ spec, onAction, fileManagerContent, className }: HbarAppUiFileManagerProps) {
  return (
    <LumenFileManager
      variant={spec.variant}
      variantId={spec.id}
      content={fileManagerContent}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
      onAction={
        onAction
          ? ({ actionId, value }) =>
              onAction(
                value === undefined
                  ? { variantId: spec.id, actionId }
                  : { variantId: spec.id, actionId, value },
              )
          : undefined
      }
    />
  )
}
