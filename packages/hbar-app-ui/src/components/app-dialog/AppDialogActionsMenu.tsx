import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {Archive, ChevronDown, ChevronRight, Copy, FileText, Link, Pencil, Trash2} from 'lucide-react'
import {DialogFrame, reportDialogAction, type AppDialogProps} from './DialogPrimitives'

type MenuItem = {
    readonly id: string
    readonly label: string
    readonly shortcut?: string
    readonly icon: typeof Pencil
    readonly danger?: boolean
    readonly submenu?: boolean
}

const menuItems: readonly MenuItem[] = [
    {id: 'rename', label: 'Rename report', shortcut: '⌘R', icon: Pencil},
    {id: 'duplicate', label: 'Duplicate', shortcut: '⌘D', icon: Copy},
    {id: 'export', label: 'Export as', icon: FileText, submenu: true},
    {id: 'copy', label: 'Copy link', shortcut: '⌘⇧C', icon: Link},
    {id: 'archive', label: 'Move to archive', icon: Archive},
    {id: 'delete', label: 'Delete report', icon: Trash2, danger: true},
]

export function AppDialogActionsMenu({spec, onAction}: AppDialogProps): React.JSX.Element {
    const [open, setOpen] = useState(true)
    return <DialogFrame spec={spec} onAction={onAction} className="hbar-app-ui-dialog-variant-7">
        <div className="hbar-app-ui-dialog-menu-stage">
            <div className="hbar-app-ui-dialog-menu-anchor">
                <button type="button" className="hbar-app-ui-dialog-trigger hbar-app-ui-menu-trigger" aria-expanded={open} aria-haspopup="menu" onClick={() => {
                    setOpen((current) => !current)
                    reportDialogAction(onAction, spec, 'toggle', open ? 'closed' : 'open')
                }}>Report actions <HbarAppUiIcon icon={ChevronDown} tier="sm" /></button>
                {open && <div className="hbar-app-ui-dialog-menu" role="menu" aria-label="Report actions">
                    {menuItems.map((item, index) => {
                        const Icon = item.icon
                        return <div key={item.id}>
                            {index === 2 || index === 4 ? <hr/> : null}
                            <button type="button" className={`${index === 0 ? 'is-selected ' : ''}${item.danger ? 'is-danger' : ''}`.trim()} role="menuitem" onClick={() => reportDialogAction(onAction, spec, item.id)}>
                                <HbarAppUiIcon icon={Icon} tier="md" /><span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}{item.submenu && <HbarAppUiIcon icon={ChevronRight} tier="sm" className="hbar-app-ui-dialog-menu-chevron" />}
                            </button>
                        </div>
                    })}
                </div>}
            </div>
        </div>
    </DialogFrame>
}
