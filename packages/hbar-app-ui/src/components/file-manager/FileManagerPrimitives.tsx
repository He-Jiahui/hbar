import { LumenButton } from '@lumen/app-ui'
import type {ButtonHTMLAttributes, ReactNode} from 'react'
import {Archive, File, FileImage, FileText, Folder} from 'lucide-react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiFileKind} from './FileManagerContent'
import {ActionSurfaceFrame} from '../SurfaceFrame'
import './FileManagerSurface.css'

export function FileManagerFrame({spec, onAction, className, children}: HbarAppUiVariantProps & {readonly children: ReactNode}) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className={`hbar-app-ui-file-manager-surface ${className ?? ''}`}>
        {children}
    </ActionSurfaceFrame>
}

export function FileManagerButton({children, tone = 'neutral', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly tone?: 'neutral' | 'accent'
}) {
    return <LumenButton {...props}
                   className={`hbar-app-ui-file-manager-button hbar-app-ui-file-manager-button-${tone} ${props.className ?? ''}`}>{children}</LumenButton>
}

export function FileManagerIcon({kind, tier = 'sm', label}: {readonly kind: HbarAppUiFileKind; readonly tier?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; readonly label?: string | undefined}) {
    const className = `hbar-app-ui-file-manager-icon hbar-app-ui-icon-${tier}`
    const props = label ? {className, 'aria-label': label} : {className, 'aria-hidden': true}
    switch (kind) {
        case 'folder':
            return <Folder {...props} />
        case 'image':
            return <FileImage {...props} />
        case 'document':
            return <FileText {...props} />
        case 'archive':
            return <Archive {...props} />
        case 'video':
        case 'file':
            return <File {...props} />
    }
}
