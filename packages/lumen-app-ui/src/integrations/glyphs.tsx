import * as React from 'react'

type GlyphProps = React.SVGProps<SVGSVGElement>

function Glyph({ name, ...props }: GlyphProps & { readonly name: string }) {
  let path: string
  switch (name) {
    case 'check':
      path = 'm5 12 4 4 10-10'
      break
    case 'plus':
      path = 'M12 5v14M5 12h14'
      break
    case 'eye':
      path = 'M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5-2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z'
      break
    case 'eye-off':
      path =
        'm4 4 16 16M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.8M7.1 7.1A15 15 0 0 0 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3.2-.6M9.9 9.9a3 3 0 0 0 4.2 4.2'
      break
    case 'key':
      path = 'M14 7a5 5 0 1 1-1.5 3.6L21 19v2h-3v-2h-2v-2h-2l-2.5-2.5'
      break
    case 'copy':
      path = 'M8 8h12v12H8zM4 4h12v4M4 4v12h4'
      break
    case 'trash':
      path = 'M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6'
      break
    case 'rotate':
      path = 'M4 8V3m0 0h5M4 3l4 4a8 8 0 1 1-2 9'
      break
    case 'search':
      path = 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm5 11 5 5'
      break
    case 'arrow-up-right':
      path = 'M8 16 16 8m-7 0h7v7'
      break
    case 'unplug':
      path = 'm8 12-4 4m4-8L5 5m11 7 4-4m-4 8 3 3M9 15l-2 2m8-8 2-2M10 13l4-4'
      break
    case 'chevron-down':
      path = 'm6 9 6 6 6-6'
      break
    case 'webhook':
      path = 'M8 12a4 4 0 1 1 2-3.5m4 7A4 4 0 1 1 10 18m2-6a4 4 0 1 1 2 3.5M8 12h8'
      break
    case 'lock':
      path = 'M7 10V8a5 5 0 0 1 10 0v2m-12 0h14v11H5z'
      break
    case 'shield':
      path = 'M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Zm-3 10 2 2 4-4'
      break
    case 'pause':
      path = 'M9 5v14m6-14v14'
      break
    case 'play':
      path = 'm8 5 11 7-11 7Z'
      break
    default:
      path = 'M12 3 2.8 20h18.4L12 3Zm0 6v5m0 3h.01'
      break
  }
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

function named(name: string) {
  return function NamedGlyph(props: GlyphProps) {
    return <Glyph {...props} name={name} />
  }
}

export const AlertTriangle = named('alert')
export const ArrowUpRight = named('arrow-up-right')
export const Check = named('check')
export const ChevronDown = named('chevron-down')
export const Copy = named('copy')
export const Eye = named('eye')
export const EyeOff = named('eye-off')
export const KeyRound = named('key')
export const LockKeyhole = named('lock')
export const Pause = named('pause')
export const Play = named('play')
export const Plus = named('plus')
export const RefreshCw = named('rotate')
export const RotateCcw = named('rotate')
export const Search = named('search')
export const ShieldCheck = named('shield')
export const Trash2 = named('trash')
export const Unplug = named('unplug')
export const Webhook = named('webhook')
