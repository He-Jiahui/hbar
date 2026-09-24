export interface AuditEvidencePanel {
  readonly label: string
  readonly status: string
  readonly images: readonly { readonly label: string; readonly path?: string | null }[]
}

function html(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}

export function renderAuditEvidencePage(panels: readonly AuditEvidencePanel[]): string {
  const sections = panels.map((panel) => `<details>
    <summary>${html(panel.label)} <small>${html(panel.status)}</small></summary>
    <div class="paired-images">${panel.images.map((image) => `<figure>
      <figcaption>${html(image.label)}</figcaption>
      ${image.path ? `<a href="${html(image.path)}" target="_blank" rel="noopener"><img loading="lazy" src="${html(image.path)}" alt="${html(image.label)}"></a>` : '<p class="missing">Missing capture</p>'}
    </figure>`).join('')}</div>
  </details>`).join('\n')
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>React Bits Pro / Lumen paired evidence</title>
  <style>body{font:14px system-ui;margin:2rem;background:#111;color:#eee}h1{font-size:1.4rem}summary{cursor:pointer;padding:.8rem;background:#202020;overflow-wrap:anywhere}small{color:#aaa;margin-inline-start:1rem}details{border:1px solid #444;margin-block:.6rem}.paired-images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;padding:.75rem}figure{margin:0;min-width:0}figcaption{padding:.4rem;font-weight:600}img{display:block;max-width:100%;height:auto;margin-inline:auto;background:#222}a{color:inherit}.missing{color:#ff8b8b}@media(max-width:600px){body{margin:.5rem}.paired-images{grid-template-columns:1fr}}</style>
  <h1>React Bits Pro ↔ Lumen paired evidence</h1>
  <p>${panels.length} evidence panels. Expand each pair; click an image for its original resolution. Static captures and every interaction's before/after remain separate. This page does not replace the review ledger or manual sign-off.</p>
  ${sections}</html>`
}
