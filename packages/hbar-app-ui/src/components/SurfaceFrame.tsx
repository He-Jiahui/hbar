import type {ReactNode} from 'react'
import type {HbarAppUiVariantProps} from '../types'

type SurfaceFrameProps = {
    readonly spec: HbarAppUiVariantProps['spec']
    readonly children: ReactNode
    readonly className?: string
    /**
     * Kept in the frame contract so category components can be mounted by a
     * host with the same props. Actions belong to the controls rendered by the
     * category component; the frame itself has no catalog or preview chrome.
     */
    readonly onAction?: HbarAppUiVariantProps['onAction']
}

function frameClassName(spec: SurfaceFrameProps['spec'], className: string): string {
    return [
        'hbar-app-ui-variant',
        `hbar-app-ui-density-${spec.density}`,
        `hbar-app-ui-surface-${spec.profile.surface}`,
        `hbar-app-ui-state-${spec.profile.initialState}`,
        `hbar-app-ui-visual-${spec.profile.visualMode}`,
        className,
    ].filter(Boolean).join(' ')
}

/**
 * The package-level root for a recreated UI block.
 *
 * It intentionally contains only the component surface and its children.
 * Variant labels, profile facts and validation controls live in the preview
 * application so consumers do not receive documentation-page chrome.
 */
export function SurfaceFrame({spec, children, className = ''}: SurfaceFrameProps) {
    return (
        <section
            className={frameClassName(spec, className)}
            data-hbar-app-ui-component={spec.id}
            data-hbar-app-ui-surface={spec.profile.surface}
            data-hbar-app-ui-state={spec.profile.initialState}
        >
            {children}
        </section>
    )
}

/**
 * Action-aware alias retained for category modules. Action callbacks are
 * consumed by the concrete controls, never by this structural wrapper.
 */
export function ActionSurfaceFrame({spec, children, className = ''}: SurfaceFrameProps) {
    return <SurfaceFrame spec={spec} className={className}>{children}</SurfaceFrame>
}
