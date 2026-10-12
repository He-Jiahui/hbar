import * as React from 'react'

type Props = React.SVGProps<SVGSVGElement>
function Glyph({ name, ...props }: Props & { readonly name: string }) {
  let path: string
  switch (name) {
    case 'arrow-left':
      path = 'm14 6-6 6 6 6M8 12h11'
      break
    case 'arrow-right':
      path = 'm10 6 6 6-6 6M5 12h11'
      break
    case 'chevron-down':
      path = 'm6 9 6 6 6-6'
      break
    case 'chevron-right':
      path = 'm9 6 6 6-6 6'
      break
    case 'plus':
      path = 'M12 5v14M5 12h14'
      break
    case 'minus':
      path = 'M5 12h14'
      break
    case 'search':
      path = 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm5 11 5 5'
      break
    case 'menu':
      path = 'M4 7h16M4 12h16M4 17h16'
      break
    case 'more':
      path = 'M6 12h.01M12 12h.01M18 12h.01'
      break
    case 'bell':
      path = 'M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3V9Zm4 11h4'
      break
    case 'folder':
      path = 'M3 6h7l2 2h9v11H3z'
      break
    case 'star':
      path = 'm12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.8-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z'
      break
    case 'heart':
      path = 'M12 21S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12Z'
      break
    case 'bag':
      path = 'M5 8h14l1 13H4L5 8Zm4 0a3 3 0 0 1 6 0'
      break
    case 'user':
      path = 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9c0-4 3-6 7-6s7 2 7 6'
      break
    case 'download':
      path = 'M12 3v12m-5-5 5 5 5-5M4 19h16'
      break
    case 'filter':
      path = 'M4 6h16M7 12h10m-7 6h4'
      break
    case 'home':
      path = 'm3 11 9-8 9 8v10h-6v-6H9v6H3V11Z'
      break
    case 'grid':
      path = 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'
      break
    case 'share':
      path =
        'M8 12 16 7m-8 5 8 5M18 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z'
      break
    case 'copy':
      path = 'M8 8h12v12H8zM4 4h12v4M4 4v12h4'
      break
    case 'bookmark':
      path = 'M6 3h12v18l-6-4-6 4V3Z'
      break
    case 'book':
      path = 'M4 4h6a2 2 0 0 1 2 2v15a3 3 0 0 0-3-3H4V4Zm16 0h-6a2 2 0 0 0-2 2v15a3 3 0 0 1 3-3h5V4Z'
      break
    case 'moon':
      path = 'M20 15a8 8 0 0 1-11-11 8 8 0 1 0 11 11Z'
      break
    case 'globe':
      path = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c3 3 3 15 0 18m0-18c-3 3-3 15 0 18'
      break
    case 'zap':
      path = 'm13 2-8 12h6l-1 8 9-13h-6z'
      break
    case 'settings':
      path =
        'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4'
      break
    case 'history':
      path = 'M4 4v6h6M5 9a8 8 0 1 1 1 8M12 7v5l3 2'
      break
    case 'branch':
      path = 'M6 3v12a4 4 0 0 0 4 4h4m0 0-3-3m3 3-3 3M18 3v5a4 4 0 0 1-4 4H6'
      break
    case 'message':
      path = 'M3 4h18v13H8l-5 4V4Z'
      break
    case 'list':
      path = 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'
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
const named = (name: string) =>
  function NamedGlyph(props: Props) {
    return <Glyph {...props} name={name} />
  }
export const ArrowLeft = named('arrow-left'),
  ArrowRight = named('arrow-right'),
  Bell = named('bell'),
  BookOpen = named('book'),
  Bookmark = named('bookmark'),
  ChevronDown = named('chevron-down'),
  ChevronRight = named('chevron-right'),
  CircleHelp = named('help'),
  CirclePlus = named('plus'),
  Copy = named('copy'),
  Download = named('download'),
  Filter = named('filter'),
  Folder = named('folder'),
  GitBranch = named('branch'),
  Globe2 = named('globe'),
  Grid2X2 = named('grid'),
  Heart = named('heart'),
  History = named('history'),
  House = named('home'),
  List = named('list'),
  Menu = named('menu'),
  MessageSquare = named('message'),
  Minus = named('minus'),
  Moon = named('moon'),
  MoreHorizontal = named('more'),
  Plus = named('plus'),
  Search = named('search'),
  Settings = named('settings'),
  Share2 = named('share'),
  ShoppingBag = named('bag'),
  SlidersHorizontal = named('filter'),
  Star = named('star'),
  UserPlus = named('user'),
  UserRound = named('user'),
  Zap = named('zap')
