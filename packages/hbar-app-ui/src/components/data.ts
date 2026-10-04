import type {HbarAppUiDataRow, HbarAppUiTimelineStep} from '../types'

export const activitySteps: readonly HbarAppUiTimelineStep[] = [
    {id: 'one', label: 'Load workspace context', detail: '0.4s', status: 'complete'},
    {id: 'two', label: 'Inspect the current task', detail: '1.3s', status: 'complete'},
    {id: 'three', label: 'Apply the requested change', detail: 'Running 12.8s', status: 'active'},
    {id: 'four', label: 'Validate the result', detail: 'Waiting', status: 'pending'},
    {id: 'five', label: 'Prepare the handoff', detail: 'Waiting', status: 'pending'},
    {id: 'six', label: 'Archive the run', detail: 'Waiting', status: 'pending'},
]

export const workspaceRows: readonly HbarAppUiDataRow[] = [
    {id: 'alpha', name: 'Workspace sync', status: 'Healthy', value: '98.4%', detail: 'Updated 2m ago'},
    {id: 'bravo', name: 'Agent queue', status: 'Running', value: '24 jobs', detail: '3 active workers'},
    {id: 'charlie', name: 'Review gate', status: 'Blocked', value: '4 items', detail: 'Needs approval'},
    {id: 'delta', name: 'Archive export', status: 'Complete', value: '1.2 GB', detail: 'Ready to download'},
    {id: 'echo', name: 'Usage budget', status: 'Healthy', value: '64%', detail: 'Resets tomorrow'},
    {id: 'foxtrot', name: 'Notification delivery', status: 'Running', value: '99.1%', detail: 'Last check 30s ago'},
]

export const fileRows: readonly HbarAppUiDataRow[] = [
    {id: 'src', name: 'src/', status: 'Healthy', value: 'directory', detail: '24 files'},
    {id: 'readme', name: 'README.md', status: 'Complete', value: '8 KB', detail: 'Updated today'},
    {id: 'settings', name: 'settings.json', status: 'Healthy', value: '2 KB', detail: 'Workspace config'},
    {id: 'report', name: 'report.csv', status: 'Running', value: '1.2 MB', detail: 'Uploading'},
    {id: 'design', name: 'design.fig', status: 'Healthy', value: '4.8 MB', detail: 'Shared with team'},
    {id: 'archive', name: 'archive.zip', status: 'Complete', value: '18 MB', detail: 'Downloaded yesterday'},
]

export const names = ['Avery', 'Mina', 'Jon', 'Sam', 'Lee', 'Rin', 'Noah', 'Iris'] as const
