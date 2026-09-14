import {useState} from 'react'
import {
    ChevronRight,
    Cloud,
    Download,
    File,
    FileArchive,
    FileImage,
    FileText,
    Folder,
    FolderOpen,
    Pause,
    Play,
    RotateCcw,
    Upload
} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiDataTable,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiDataRow, HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'
import {fileRows} from './data'

type FileProps = HbarAppUiVariantProps

function DriveExplorer({spec, onAction}: FileProps) {
    const [folder, setFolder] = useState('Workspace');
    const rows: readonly HbarAppUiDataRow[] = fileRows.slice(0, 4);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-file-variant-1"><HbarAppUiToolbar
        title="Drive explorer" detail={`${folder} · suggested folders`}/><HbarAppUiButton tone="accent"
                                                                                          onClick={() => onAction?.({
                                                                                              variantId: spec.id,
                                                                                              actionId: 'upload'
                                                                                          })}><Upload size={13}/>Upload</HbarAppUiButton>
        <div className="hbar-app-ui-drive-layout">
            <aside><strong>Folders</strong>{['Workspace', 'Projects', 'Shared', 'Archive'].map((item) => <button
                type="button" className={folder === item ? 'is-selected' : ''} key={item}
                onClick={() => setFolder(item)}><Folder size={13}/>{item}</button>)}
                <div className="hbar-app-ui-storage-meter"><span>Storage</span><HbarAppUiProgress value={64}
                                                                                                  label="Storage used"/><small>6.4
                    GB of 10 GB</small></div>
            </aside>
            <main>
                <div className="hbar-app-ui-breadcrumbs"><FolderOpen size={13}/>{folder}<ChevronRight size={13}/>Files
                </div>
                <HbarAppUiDataTable rows={rows}
                                    onSelect={(id) => onAction?.({variantId: spec.id, actionId: 'open', value: id})}/>
            </main>
        </div>
    </ActionSurfaceFrame>
}

function AssetGrid({spec, onAction}: FileProps) {
    const [filter, setFilter] = useState('All');
    const [selected, setSelected] = useState('');
    const assets = ['hero.png', 'notes.md', 'diagram.svg', 'archive.zip', 'report.csv', 'avatar.png'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-file-variant-2"><HbarAppUiToolbar
        title="Asset grid" detail="Breadcrumbs · type filters · selection bar"/>
        <div className="hbar-app-ui-chip-row">{['All', 'Images', 'Documents'].map((item) => <HbarAppUiButton
            className={filter === item ? 'is-selected' : ''} key={item}
            onClick={() => setFilter(item)}>{item}</HbarAppUiButton>)}</div>
        <HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'download', value: selected})}><Download
            size={13}/>Download</HbarAppUiButton>
        <div
            className="hbar-app-ui-file-grid">{assets.filter((asset) => filter === 'All' || (filter === 'Images' ? asset.endsWith('.png') || asset.endsWith('.svg') : asset.endsWith('.md') || asset.endsWith('.csv'))).map((asset) =>
            <button type="button" className={selected === asset ? 'is-selected' : ''} key={asset}
                    onClick={() => setSelected(asset)}><FileImage size={22}/><strong>{asset}</strong><small>2.4 MB ·
                today</small></button>)}</div>
        {selected &&
            <div className="hbar-app-ui-selection-bar"><span>{selected} selected</span><HbarAppUiButton tone="accent"
                                                                                                        onClick={() => onAction?.({
                                                                                                            variantId: spec.id,
                                                                                                            actionId: 'open',
                                                                                                            value: selected
                                                                                                        })}>Open
                preview</HbarAppUiButton></div>}</ActionSurfaceFrame>
}

function FileDetail({spec, onAction}: FileProps) {
    const [shared, setShared] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-file-variant-3"><HbarAppUiToolbar
        title="File browser" detail="Preview · metadata · sharing · activity"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'download', value: 'README.md'})}><Download size={13}/>Download</HbarAppUiButton>
        <div className="hbar-app-ui-file-detail-layout">
            <aside>
                <button type="button" className="is-selected"><FileText size={14}/>README.md</button>
                <button type="button"><File size={14}/>report.csv</button>
                <button type="button"><FileArchive size={14}/>archive.zip</button>
            </aside>
            <main><HbarAppUiSpotlight className="hbar-app-ui-file-preview-large"><FileText
                size={26}/><strong>README.md</strong><p># Workspace notes</p><p>Capture decisions and context here.</p>
            </HbarAppUiSpotlight>
                <div className="hbar-app-ui-file-metadata">
                    <span>Size <b>8 KB</b></span><span>Updated <b>Today</b></span><span>Owner <b>Avery</b></span></div>
                <div className="hbar-app-ui-share-row"><HbarAppUiStatus value={shared ? 'Shared' : 'Private'}
                                                                        tone={shared ? 'positive' : 'neutral'}/><HbarAppUiButton
                    onClick={() => {
                        setShared((value) => !value);
                        onAction?.({variantId: spec.id, actionId: 'share', value: String(!shared)})
                    }}>{shared ? 'Unshare' : 'Share'}</HbarAppUiButton></div>
                <p className="hbar-app-ui-note">Activity · updated by Avery 2m ago</p></main>
        </div>
    </ActionSurfaceFrame>
}

function UploadManager({spec, onAction}: FileProps) {
    const [paused, setPaused] = useState(false);
    const [retrying, setRetrying] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-file-variant-4"><HbarAppUiToolbar
        title="Upload manager" detail="Transfers, retries and summary"/><HbarAppUiButton onClick={() => {
        setPaused((value) => !value);
        onAction?.({variantId: spec.id, actionId: 'pause', value: String(!paused)})
    }}>{paused ? <Play size={13}/> :
        <Pause size={13}/>}{paused ? 'Resume all' : 'Pause all'}</HbarAppUiButton><HbarAppUiButton tone="accent"
                                                                                                   onClick={() => onAction?.({
                                                                                                       variantId: spec.id,
                                                                                                       actionId: 'upload'
                                                                                                   })}><Upload
        size={13}/>Add files</HbarAppUiButton>
        <div className="hbar-app-ui-upload-manager"><HbarAppUiSpotlight>
            <div><FileText size={15}/><strong>requirements.pdf</strong><small>{paused ? 'Paused' : 'Uploading'} · 2.1
                MB</small></div>
            <HbarAppUiProgress value={paused ? 44 : 78} label="requirements upload"
                               tone="accent"/><span>{paused ? '44%' : '78%'}</span></HbarAppUiSpotlight><HbarAppUiSpotlight>
            <div><FileArchive size={15}/><strong>archive.zip</strong><small>{retrying ? 'Retrying' : 'Failed'} · network
                timeout</small></div>
            <HbarAppUiStatus value={retrying ? 'Retrying' : 'Failed'} tone="danger"/><HbarAppUiButton onClick={() => {
            setRetrying(true);
            onAction?.({variantId: spec.id, actionId: 'retry', value: 'archive.zip'})
        }}><RotateCcw size={13}/>Retry</HbarAppUiButton></HbarAppUiSpotlight></div>
        <div className="hbar-app-ui-transfer-summary"><Cloud size={14}/>1.4 MB/s · 1 of 2 transfers active</div>
    </ActionSurfaceFrame>
}

export function FileManager({spec, onAction}: FileProps) {
    switch (spec.variant) {
        case 1:
            return <DriveExplorer spec={spec} onAction={onAction}/>;
        case 2:
            return <AssetGrid spec={spec} onAction={onAction}/>;
        case 3:
            return <FileDetail spec={spec} onAction={onAction}/>;
        case 4:
            return <UploadManager spec={spec} onAction={onAction}/>;
        default:
            return <DriveExplorer spec={spec} onAction={onAction}/>
    }
}
