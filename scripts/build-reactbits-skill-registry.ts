import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { REFERENCE_VARIANTS } from '../apps/web/src/react-bits/reference/reference-manifest'

function tableText(value: string): string {
  return value.replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const rows = REFERENCE_VARIANTS.map((variant) => {
  const binding = variant.productionBinding.mode === 'hbar-bound' ? `hbar-bound: ${variant.productionBinding.adapterId}` : `fixture-only: ${variant.productionBinding.reason}`
  const fixture = `apps/web/src/react-bits/reference/variants/${variant.category}/${variant.variantSlug}.tsx`
  const observation = variant.observation
  const publicControls = [...(observation.viewportControls ?? []), ...(observation.actionControls ?? [])].slice(0, 6).join(', ')
  const interactionTargets = variant.interactions.map((interaction) => `${interaction.action}: ${interaction.target} → ${interaction.expectedState}`).join('; ')
  const logicDesignStyle = [variant.description, `public shell: ${observation.publicSurface.join(', ')}`, `controls: ${publicControls || 'fixture controls recorded'}`, `interaction: ${interactionTargets}`].map(tableText).join(' · ')
  return `| ${variant.referenceId} | [${variant.variantSlug}](${variant.sourceUrl}) | ${fixture} | ${tableText(binding)} | ${logicDesignStyle} |`
})
const content = `# ReactBits registry → $hbar-reactbits-ui\n\nThis generated matrix is the bidirectional binding between the public ReactBits URL, the independent hbar fixture module, the clean-room observation record and the optional typed production adapter. It is intentionally limited to public HTML/CSS/JS metadata; it never contains the private Code-tab source. The final column records the concrete public description, shell controls, and interaction contract used to derive each fixture's logic, information hierarchy, responsive behavior, and hbar token styling.\n\n| referenceId | public source URL | independent fixture | production binding | observed logic / design / style |\n|---|---|---|---|---|\n${rows.join('\n')}\n`
const target = join(process.cwd(), '.agents', 'skills', 'hbar-reactbits-ui', 'references', 'reactbits-registry.md')
await mkdir(join(process.cwd(), '.agents', 'skills', 'hbar-reactbits-ui', 'references'), { recursive: true })
await Bun.write(target, content)
console.log(`ReactBits skill registry: ${rows.length} variant mappings`)
