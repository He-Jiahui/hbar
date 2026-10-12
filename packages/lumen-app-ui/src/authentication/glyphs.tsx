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
    case 'arrow-left':
      path = 'm14 6-6 6 6 6M8 12h11'
      break
    case 'arrow-right':
      path = 'm10 6 6 6-6 6M5 12h11'
      break
    case 'chevron-right':
      path = 'm9 6 6 6-6 6'
      break
    case 'eye':
      path = 'M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5-2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z'
      break
    case 'eye-off':
      path =
        'm4 4 16 16M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.8M7.1 7.1A15 15 0 0 0 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3.2-.6M9.9 9.9a3 3 0 0 0 4.2 4.2'
      break
    case 'mail':
      path = 'M3 5h18v14H3zM3 7l9 7 9-7'
      break
    case 'key':
      path = 'M14 7a5 5 0 1 1-1.5 3.6L21 19v2h-3v-2h-2v-2h-2l-2.5-2.5'
      break
    case 'laptop':
      path = 'M4 5h16v11H4zM2 19h20'
      break
    case 'phone':
      path = 'M8 2h8v20H8zM11 18h2'
      break
    case 'monitor':
      path = 'M3 4h18v13H3zM8 21h8M12 17v4'
      break
    case 'building':
      path = 'M4 21V5l8-3 8 3v16M8 8h1m6 0h1M8 12h1m6 0h1M8 16h1m6 0h1M10 21v-3h4v3'
      break
    case 'clock':
      path = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2'
      break
    case 'shield':
      path = 'M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Zm-3 10 2 2 4-4'
      break
    case 'users':
      path =
        'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6m-8 9c-4 0-6 2-6 5v1h12v-1c0-3-2-5-6-5Zm8 0c3.2 0 6 1.7 6 5v1h-6'
      break
    case 'folder':
      path = 'M3 6h7l2 2h9v11H3z'
      break
    case 'search':
      path = 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm5 11 5 5'
      break
    case 'logout':
      path = 'M10 4H4v16h6m5-4 4-4-4-4m4 4H9'
      break
    case 'external':
      path = 'M14 4h6v6m0-6-9 9M20 14v6H4V4h6'
      break
    case 'rotate':
      path = 'M4 8V3m0 0h5M4 3l4 4a8 8 0 1 1-2 9'
      break
    case 'apple':
      path =
        'M15.5 4.5c.8-1 1.2-2 1.1-3-1 .1-2.1.7-2.8 1.5-.7.8-1.1 1.8-1 2.7 1 .1 2-.4 2.7-1.2ZM12 6c-1.8 0-3.1-1-4.4-1C5 5 3 7.2 3 10.5 3 15 6 21 8.5 21c1.2 0 2-1 3.5-1s2.2 1 3.5 1c2.5 0 5.1-5.2 5.5-7.1-2.7-1.2-3.2-5-1-6.7C18.8 6.4 17.5 6 16 6c-1.5 0-2.6 1-4 1Z'
      break
    case 'branch':
      path = 'M6 3v12a4 4 0 0 0 4 4h4m0 0-3-3m3 3-3 3M18 3v5a4 4 0 0 1-4 4H6m12-9-3 3m3-3 3 3'
      break
    case 'link':
      path = 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2'
      break
    case 'wifi':
      path = 'M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0m-9 4a5 5 0 0 1 6 0m-3 3h.01'
      break
    case 'upload':
      path = 'M12 16V4m-5 5 5-5 5 5M4 15v5h16v-5'
      break
    case 'qr':
      path = 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM15 14h2v2h-2zm3 3h2v3h-3v-2'
      break
    case 'pointer':
      path = 'm6 3 12 8-6 2-2 6-4-16Z'
      break
    case 'more':
      path = 'M6 12h.01M12 12h.01M18 12h.01'
      break
    default:
      path = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 13h.01M12 8a2.5 2.5 0 0 1 0 5v1'
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

export const Apple = named('apple')
export const ArrowLeft = named('arrow-left')
export const ArrowRight = named('arrow-right')
export const Building2 = named('building')
export const Check = named('check')
export const ChevronRight = named('chevron-right')
export const CircleHelp = named('help')
export const Clock3 = named('clock')
export const ExternalLink = named('external')
export const Eye = named('eye')
export const EyeOff = named('eye-off')
export const Folder = named('folder')
export const GitBranch = named('branch')
export const KeyRound = named('key')
export const Laptop = named('laptop')
export const Link2 = named('link')
export const LogOut = named('logout')
export const Mail = named('mail')
export const Monitor = named('monitor')
export const MoreHorizontal = named('more')
export const MousePointer2 = named('pointer')
export const Plus = named('plus')
export const QrCode = named('qr')
export const RotateCcw = named('rotate')
export const Search = named('search')
export const ShieldCheck = named('shield')
export const Smartphone = named('phone')
export const Upload = named('upload')
export const Users = named('users')
export const Wifi = named('wifi')
