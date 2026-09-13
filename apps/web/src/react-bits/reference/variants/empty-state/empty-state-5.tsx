import type { ReferenceFixtureProps } from '../../reference-types'
import { FileUp, Link2, UploadCloud } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './empty-state-5.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/empty-state/empty-state-5. */
export default function EmptyState5(props: ReferenceFixtureProps) {
  const [uploaded, setUploaded] = useState(false)
  return <section className="rb-public-empty-5" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><div className="rb-empty-5-shell"><nav><span>Northwind</span><b>/</b><span>Brand</span><b>/</b><strong>2025 refresh</strong></nav><header><div><h2>This folder is empty</h2><p>Drag files anywhere in this area, or add them from your computer.</p><small>Everything here is shared with the Brand team.</small></div><div><button type="button" className="primary" onClick={() => setUploaded(true)}><UploadCloud size={14} /> {uploaded ? 'Uploaded' : 'Upload files'}</button><button type="button"><Link2 size={14} /> Import from a link</button></div></header><article className="rb-empty-5-dropzone"><FileUp size={22} /><strong>Drop files to upload</strong><p>PDF PNG JPG SVG FIG MP4</p><small>Up to 2 GB per file · 46 GB of 100 GB used in this workspace</small></article></div></section>
}
