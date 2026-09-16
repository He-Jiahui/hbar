import { HbarAppUiIcon, type HbarAppUiIconTier } from '../../icon'
import type {LucideIcon, LucideProps} from 'lucide-react'
import type {ButtonHTMLAttributes, ReactNode} from 'react'
import type {HbarAppUiEvent, HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'
import type {HbarAppUiEditorInlineSegment} from './EditorContent'

export type EditorSurfaceProps = HbarAppUiVariantProps

export function reportEditorAction(
    onAction: EditorSurfaceProps['onAction'],
    spec: EditorSurfaceProps['spec'],
    actionId: string,
    value?: string,
): void {
    const event: HbarAppUiEvent = value === undefined
        ? {variantId: spec.id, actionId}
        : {variantId: spec.id, actionId, value}
    onAction?.(event)
}

export function EditorFrame({
    spec,
    onAction,
    className,
    children,
}: EditorSurfaceProps & {readonly className: string; readonly children: ReactNode}) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className={`hbar-app-ui-editor-surface ${className}`}>{children}</ActionSurfaceFrame>
}

export function EditorButton({
    kind = 'neutral',
    className = '',
    children,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly kind?: 'neutral' | 'light' | 'icon' | 'quiet'
}) {
    return <button {...props} type={props.type ?? 'button'}
                   className={`hbar-app-ui-editor-button hbar-app-ui-editor-button-${kind}${className ? ` ${className}` : ''}`}>{children}</button>
}

export function EditorIconButton({
    label,
    children,
    className = '',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {readonly label: string}) {
    return <EditorButton {...props} kind="icon" className={className} aria-label={props['aria-label'] ?? label}
                         title={props.title ?? label}>{children}</EditorButton>
}

export type EditorIconTier = HbarAppUiIconTier



/** Semantic icon tiers keep measured preview values out of public APIs. */
export function EditorIcon({icon: Icon, tier = 'md', ...props}: Omit<LucideProps, 'size'> & {
    readonly icon: LucideIcon
    readonly tier?: EditorIconTier
}) {
    return <HbarAppUiIcon icon={Icon} tier={tier} {...props}/>
}

export function EditorInlineText({
    segments,
    onOpenSuggestion,
}: {
    readonly segments: readonly HbarAppUiEditorInlineSegment[]
    readonly onOpenSuggestion?: ((suggestionId: string) => void) | undefined
}) {
    return <>{segments.map((segment, index) => {
        const key = segment.kind === 'suggestion' ? segment.suggestionId : `${segment.kind}-${index}`
        switch (segment.kind) {
            case 'text':
                return <span key={key}>{segment.value}</span>
            case 'strong':
                return <strong key={key}>{segment.value}</strong>
            case 'emphasis':
                return <em key={key}>{segment.value}</em>
            case 'suggestion':
                return <button type="button" className="hbar-app-ui-editor-inline-suggestion" key={key}
                               onClick={() => onOpenSuggestion?.(segment.suggestionId)}>{segment.value}</button>
        }
    })}</>
}

export function EditorToolbar({children, className = ''}: {readonly children: ReactNode; readonly className?: string}) {
    return <header className={`hbar-app-ui-editor-toolbar-surface${className ? ` ${className}` : ''}`}>{children}</header>
}
