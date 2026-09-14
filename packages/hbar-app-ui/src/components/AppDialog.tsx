import {useState} from 'react'
import {ArrowLeft, ArrowRight, ChevronDown, FileText, MoreHorizontal, Save, Trash2, X} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiDialog,
    HbarAppUiIconButton,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type DialogProps = HbarAppUiVariantProps

function StandardDialog({spec, onAction}: DialogProps) {
    const [open, setOpen] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dialog-variant-1"><HbarAppUiToolbar title="Standard dialog"
                                                                                          detail="Scrollable body and footer pair"/><HbarAppUiButton
        tone="accent" onClick={() => {
        setOpen(true);
        onAction?.({variantId: spec.id, actionId: 'open'})
    }}>Open dialog</HbarAppUiButton><HbarAppUiDialog open={open} title="Workspace details"
                                                     onClose={() => setOpen(false)} footer={<><HbarAppUiButton
        onClick={() => setOpen(false)}>Cancel</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => {
        setOpen(false);
        onAction?.({variantId: spec.id, actionId: 'confirm'})
    }}>Save</HbarAppUiButton></>}><p>Review the selected workspace details before saving.</p>
        <div className="hbar-app-ui-dialog-scroll"><p>Owner: Avery Chen</p><p>Region: us-east</p><p>Updated: just
            now</p><p>Notes: Changes remain local to this demo.</p></div>
    </HbarAppUiDialog></ActionSurfaceFrame>
}

function DestructiveDialog({spec, onAction}: DialogProps) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dialog-variant-2"><HbarAppUiToolbar
        title="Destructive confirmation" detail="Type the resource name"/><HbarAppUiButton tone="danger"
                                                                                           onClick={() => setOpen(true)}><Trash2
        size={13}/>Delete</HbarAppUiButton><HbarAppUiDialog open={open} title="Delete October workspace?"
                                                            onClose={() => setOpen(false)}
                                                            footer={<><HbarAppUiButton onClick={() => setOpen(false)}>Keep
                                                                workspace</HbarAppUiButton><HbarAppUiButton
                                                                tone="danger" disabled={name !== 'October workspace'}
                                                                onClick={() => {
                                                                    setOpen(false);
                                                                    onAction?.({
                                                                        variantId: spec.id,
                                                                        actionId: 'confirm',
                                                                        value: 'delete'
                                                                    })
                                                                }}>Delete permanently</HbarAppUiButton></>}><p>This
        removes all sessions and files. Type <strong>October workspace</strong> to continue.</p><input value={name}
                                                                                                       onChange={(event) => setName(event.target.value)}
                                                                                                       aria-label="Resource name"
                                                                                                       placeholder="October workspace"/></HbarAppUiDialog></ActionSurfaceFrame>
}

function FormDialog({spec, onAction}: DialogProps) {
    const [open, setOpen] = useState(false);
    const [valid, setValid] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dialog-variant-3"><HbarAppUiToolbar title="Form dialog"
                                                                                          detail="Validation and sticky footer"/><HbarAppUiButton
        onClick={() => setOpen(true)}>Open form</HbarAppUiButton><HbarAppUiDialog open={open} title="Create a workspace"
                                                                                  onClose={() => setOpen(false)}
                                                                                  footer={<div
                                                                                      className="hbar-app-ui-sticky-dialog-footer">
                                                                                      <HbarAppUiStatus
                                                                                          value={valid ? 'Ready' : 'Complete fields'}
                                                                                          tone={valid ? 'positive' : 'warning'}/><HbarAppUiButton
                                                                                      tone="accent" disabled={!valid}
                                                                                      onClick={() => {
                                                                                          setOpen(false);
                                                                                          onAction?.({
                                                                                              variantId: spec.id,
                                                                                              actionId: 'save'
                                                                                          })
                                                                                      }}>Create</HbarAppUiButton>
                                                                                  </div>}><label>Name<input
        placeholder="Workspace name"
        onChange={(event) => setValid(event.target.value.trim().length > 2)}/></label><label>Region<select
        defaultValue="us-east">
        <option>us-east</option>
        <option>eu-west</option>
    </select></label></HbarAppUiDialog></ActionSurfaceFrame>
}

function MultiStepDialog({spec, onAction}: DialogProps) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(1);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dialog-variant-4"><HbarAppUiToolbar title="Multi-step dialog"
                                                                                          detail={`${step} of 3`}/><HbarAppUiButton
        tone="accent" onClick={() => setOpen(true)}>Start</HbarAppUiButton><HbarAppUiDialog open={open}
                                                                                            title={`Step ${step} · Workspace setup`}
                                                                                            onClose={() => setOpen(false)}
                                                                                            footer={<><HbarAppUiButton
                                                                                                disabled={step === 1}
                                                                                                onClick={() => setStep((value) => value - 1)}><ArrowLeft
                                                                                                size={13}/>Back</HbarAppUiButton><HbarAppUiButton
                                                                                                tone="accent"
                                                                                                onClick={() => {
                                                                                                    if (step === 3) {
                                                                                                        setOpen(false);
                                                                                                        onAction?.({
                                                                                                            variantId: spec.id,
                                                                                                            actionId: 'confirm'
                                                                                                        })
                                                                                                    } else setStep((value) => value + 1)
                                                                                                }}>{step === 3 ? 'Finish' : 'Next'}<ArrowRight
                                                                                                size={13}/></HbarAppUiButton></>}><HbarAppUiProgress
        value={step / 3 * 100} label="Dialog progress"/>
        <p>{step === 1 ? 'Choose a workspace name.' : step === 2 ? 'Select the default environment.' : 'Review and create the workspace.'}</p>
    </HbarAppUiDialog></ActionSurfaceFrame>
}

function Drawer({spec, onAction}: DialogProps) {
    const [open, setOpen] = useState(false);
    const [dirty, setDirty] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dialog-variant-5"><HbarAppUiToolbar title="Side drawer"
                                                                                          detail="Unsaved-change guard"/><HbarAppUiButton
        onClick={() => setOpen(true)}>Open drawer</HbarAppUiButton>{open &&
        <div className="hbar-app-ui-drawer-overlay" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !dirty) setOpen(false)
        }}>
            <aside className="hbar-app-ui-side-drawer">
                <header><strong>Edit workspace</strong><HbarAppUiIconButton label="Close"
                                                                            onClick={() => setOpen(false)}><X
                    size={14}/></HbarAppUiIconButton></header>
                <label>Name<input defaultValue="October workspace" onChange={() => setDirty(true)}/></label><label>Notes<textarea
                defaultValue="Keep the context close to the action." onChange={() => setDirty(true)}/></label>
                <div className="hbar-app-ui-drawer-footer"><HbarAppUiStatus value={dirty ? 'Unsaved' : 'Saved'}
                                                                            tone={dirty ? 'warning' : 'positive'}/><HbarAppUiButton
                    tone="accent" onClick={() => {
                    setDirty(false);
                    setOpen(false);
                    onAction?.({variantId: spec.id, actionId: 'save'})
                }}><Save size={13}/>Save</HbarAppUiButton></div>
            </aside>
        </div>}</ActionSurfaceFrame>
}

function DetailSheet({spec, onAction}: DialogProps) {
    const [open, setOpen] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dialog-variant-6"><HbarAppUiToolbar title="Detail sheet"
                                                                                          detail="Summary, metadata and secondary actions"/><HbarAppUiButton
        onClick={() => setOpen(true)}>View details</HbarAppUiButton>{open &&
        <div className="hbar-app-ui-sheet-overlay" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
        }}>
            <section className="hbar-app-ui-detail-sheet">
                <header><strong>Run summary</strong><HbarAppUiIconButton label="Close" onClick={() => setOpen(false)}><X
                    size={14}/></HbarAppUiIconButton></header>
                <HbarAppUiSpotlight><FileText size={17}/>
                    <div><strong>reconcile-october</strong><small>Completed · 12.8s</small></div>
                    <HbarAppUiStatus value="Complete" tone="positive"/></HbarAppUiSpotlight>
                <dl>
                    <div>
                        <dt>Owner</dt>
                        <dd>Avery Chen</dd>
                    </div>
                    <div>
                        <dt>Started</dt>
                        <dd>10:24:18</dd>
                    </div>
                    <div>
                        <dt>Items</dt>
                        <dd>1,284</dd>
                    </div>
                </dl>
                <HbarAppUiButton onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'activity'})}>Open
                    activity</HbarAppUiButton></section>
        </div>}</ActionSurfaceFrame>
}

function PopoverSet({spec, onAction}: DialogProps) {
    const [open, setOpen] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-dialog-variant-7"><HbarAppUiToolbar title="Popover set"
                                                                                          detail="Menus, submenus, separators and shortcuts"/><HbarAppUiButton
        onClick={() => setOpen((value) => !value)}><MoreHorizontal size={14}/>More</HbarAppUiButton>{open &&
        <HbarAppUiSpotlight className="hbar-app-ui-menu-set">
            <button type="button" onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'open',
                value: 'duplicate'
            })}>Duplicate <kbd>⌘D</kbd></button>
            <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'move'})}>Move
                to… <ChevronDown size={12}/></button>
            <hr/>
            <button type="button"
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'archive'})}>Archive
            </button>
        </HbarAppUiSpotlight>}</ActionSurfaceFrame>
}

export function AppDialog({spec, onAction}: DialogProps) {
    switch (spec.variant) {
        case 1:
            return <StandardDialog spec={spec} onAction={onAction}/>;
        case 2:
            return <DestructiveDialog spec={spec} onAction={onAction}/>;
        case 3:
            return <FormDialog spec={spec} onAction={onAction}/>;
        case 4:
            return <MultiStepDialog spec={spec} onAction={onAction}/>;
        case 5:
            return <Drawer spec={spec} onAction={onAction}/>;
        case 6:
            return <DetailSheet spec={spec} onAction={onAction}/>;
        case 7:
            return <PopoverSet spec={spec} onAction={onAction}/>;
        default:
            return <StandardDialog spec={spec} onAction={onAction}/>
    }
}
