import { LumenButton, LumenInput } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useMemo, useState} from 'react'
import {Plus, Search} from 'lucide-react'
import {MobileFrame, MobileIconButton, MobilePhone, reportMobileAction, type MobileSurfaceProps} from './MobilePrimitives'

type Task = {
    readonly id: string
    readonly title: string
    readonly due: string
    readonly complete: boolean
}

const initialTasks: readonly Task[] = [
    {id: 'northwind-quote', title: 'Send the Northwind renewal quote', due: 'Due today', complete: false},
    {id: 'cedar-notes', title: 'Review Cedar Labs onboarding notes', due: 'Due today', complete: false},
    {id: 'refund', title: 'Approve the refund for order 4192', due: 'Tomorrow', complete: false},
    {id: 'pipeline', title: 'Draft the Q3 pipeline summary', due: 'Thursday', complete: false},
    {id: 'harbor-call', title: 'Call Harbor Coffee about seat count', due: 'Friday', complete: false},
    {id: 'meridian-checklist', title: 'Close out the Meridian pilot checklist', due: 'Friday', complete: false},
    {id: 'forecast', title: 'Update the Q3 forecast assumptions', due: 'Next week', complete: false},
]

export function TaskInboxMobile({spec, onAction}: MobileSurfaceProps): React.JSX.Element {
    const [tasks, setTasks] = useState<readonly Task[]>(initialTasks)
    const [searchOpen, setSearchOpen] = useState(false)
    const [query, setQuery] = useState('')
    const openTasks = tasks.filter((task) => !task.complete)
    const visibleTasks = useMemo(() => openTasks.filter((task) => task.title.toLowerCase().includes(query.trim().toLowerCase())), [openTasks, query])

    const toggleTask = (taskId: string) => {
        setTasks((current) => current.map((task) => task.id === taskId ? {...task, complete: !task.complete} : task))
        reportMobileAction(onAction, spec, 'confirm', taskId)
    }

    const addTask = () => {
        const id = `new-task-${tasks.length + 1}`
        setTasks((current) => [...current, {id, title: 'New follow-up task', due: 'No due date', complete: false}])
        setQuery('')
        reportMobileAction(onAction, spec, 'open', id)
    }

    return <MobileFrame spec={spec} onAction={onAction} className="hbar-app-ui-mobile-task-surface"><MobilePhone>
        <header className="hbar-app-ui-mobile-phone-header"><p className="hbar-app-ui-mobile-phone-title">Inbox</p><div className="hbar-app-ui-mobile-header-actions"><MobileIconButton label={searchOpen ? 'Close task search' : 'Search tasks'} pressed={searchOpen} onClick={() => {
            setSearchOpen((value) => !value)
            reportMobileAction(onAction, spec, 'search')
        }}><HbarAppUiIcon icon={Search} tier="md"  strokeWidth={1.7}/></MobileIconButton></div></header>
        <main className="hbar-app-ui-mobile-phone-content hbar-app-ui-mobile-task-content">
            {searchOpen &&
                <label className="hbar-app-ui-mobile-task-search"><HbarAppUiIcon icon={Search} tier="sm"  aria-hidden="true"/><LumenInput autoFocus
                                                                                                               value={query}
                                                                                                               onChange={(event) => setQuery(event.target.value)}
                                                                                                               placeholder="Search tasks"
                                                                                                               aria-label="Search tasks"/></label>}
            <p className="hbar-app-ui-mobile-eyebrow">{openTasks.length} OPEN</p>
            {visibleTasks.length ?
                <ul className="hbar-app-ui-mobile-task-list">{visibleTasks.map((task) => <li key={task.id}>
                    <LumenButton type="button" aria-pressed={task.complete} onClick={() => toggleTask(task.id)}><span
                        className="hbar-app-ui-mobile-task-check"
                        aria-hidden="true"/><span><strong>{task.title}</strong><small>{task.due}</small></span></LumenButton>
                </li>)}</ul> : <p className="hbar-app-ui-mobile-no-results">No open tasks match this search.</p>}
        </main>
        <footer className="hbar-app-ui-mobile-task-footer">
            <LumenButton type="button" className="hbar-app-ui-mobile-primary-round" aria-label="Add task" title="Add task"
                    onClick={addTask}><HbarAppUiIcon icon={Plus} tier="xl"  strokeWidth={1.6}/></LumenButton>
        </footer>
    </MobilePhone></MobileFrame>
}
