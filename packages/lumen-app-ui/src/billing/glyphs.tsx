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
    case 'x':
      path = 'm6 6 12 12m0-12L6 18'
      break
    case 'arrow-right':
      path = 'm10 6 6 6-6 6M5 12h11'
      break
    case 'arrow-up-right':
      path = 'M8 16 16 8m-7 0h7v7'
      break
    case 'chevron-down':
      path = 'm6 9 6 6 6-6'
      break
    case 'search':
      path = 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm5 11 5 5'
      break
    case 'download':
      path = 'M12 3v12m-5-5 5 5 5-5M4 19h16'
      break
    case 'mail':
      path = 'M3 5h18v14H3zM3 7l9 7 9-7'
      break
    case 'printer':
      path = 'M6 9V3h12v6M6 17H3v-6h18v6h-3M6 14h12v7H6z'
      break
    case 'send':
      path = 'm3 11 18-8-8 18-2-8-8-2Zm8 2 10-10'
      break
    case 'bolt':
      path = 'm13 2-8 12h6l-1 8 9-13h-6z'
      break
    case 'database':
      path =
        'M4 6c0-2 3.6-3 8-3s8 1 8 3-3.6 3-8 3-8-1-8-3Zm0 0v6c0 2 3.6 3 8 3s8-1 8-3V6m-16 6v6c0 2 3.6 3 8 3s8-1 8-3v-6'
      break
    case 'layers':
      path = 'm12 3 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5m-18 5 9 5 9-5'
      break
    case 'shield':
      path = 'M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Zm-3 10 2 2 4-4'
      break
    case 'sparkles':
      path =
        'm12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13Z'
      break
    case 'users':
      path =
        'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6m-8 9c-4 0-6 2-6 5v1h12v-1c0-3-2-5-6-5Zm8 0c3.2 0 6 1.7 6 5v1h-6'
      break
    case 'card':
      path = 'M3 6h18v13H3zM3 10h18M7 15h4'
      break
    case 'bank':
      path = 'm3 9 9-6 9 6M5 10v8m5-8v8m4-8v8m5-8v8M3 21h18'
      break
    case 'bell':
      path = 'M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3V9Zm4 11h4'
      break
    case 'filter':
      path = 'M4 6h16M7 12h10m-7 6h4'
      break
    case 'rotate':
      path = 'M4 8V3m0 0h5M4 3l4 4a8 8 0 1 1-2 9'
      break
    case 'warning':
      path = 'M12 3 2.8 20h18.4L12 3Zm0 6v5m0 3h.01'
      break
    case 'pencil':
      path = 'm4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Zm9-13 3.5 3.5'
      break
    default:
      path = 'M6 12h.01M12 12h.01M18 12h.01'
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

export const ArrowRight = named('arrow-right')
export const ArrowUpRight = named('arrow-up-right')
export const Bell = named('bell')
export const Bolt = named('bolt')
export const Check = named('check')
export const ChevronDown = named('chevron-down')
export const CreditCard = named('card')
export const Database = named('database')
export const Download = named('download')
export const Landmark = named('bank')
export const Layers3 = named('layers')
export const ListFilter = named('filter')
export const Mail = named('mail')
export const MoreHorizontal = named('more')
export const Pencil = named('pencil')
export const Plus = named('plus')
export const Printer = named('printer')
export const RotateCcw = named('rotate')
export const Search = named('search')
export const Send = named('send')
export const Shield = named('shield')
export const ShieldCheck = named('shield')
export const Sparkles = named('sparkles')
export const TriangleAlert = named('warning')
export const Users = named('users')
export const X = named('x')
export const Zap = named('bolt')
