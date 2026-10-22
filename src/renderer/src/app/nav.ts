import type { Icon } from '@phosphor-icons/react'
import {
  BookOpenIcon,
  BooksIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CompassIcon,
  HourglassIcon,
  HouseIcon,
  ShoppingCartIcon,
  StackIcon,
  XCircleIcon
} from '@phosphor-icons/react'

export interface NavItem {
  to: string
  label: string
  icon: Icon
  /** Indented under the item above it (e.g. Partly read under Currently reading). */
  nested?: boolean
}

export const mainNav: NavItem[] = [
  { to: '/', label: 'Home', icon: HouseIcon },
  { to: '/discover', label: 'Discover', icon: CompassIcon },
  { to: '/library', label: 'Library', icon: BooksIcon }
]

export const shelfNav: NavItem[] = [
  { to: '/shelf/read', label: 'Read', icon: CheckCircleIcon },
  { to: '/shelf/reading', label: 'Currently reading', icon: BookOpenIcon },
  { to: '/shelf/partly-read', label: 'Partly read', icon: HourglassIcon, nested: true },
  { to: '/shelf/to-read', label: 'To-read pile', icon: StackIcon },
  { to: '/shelf/want-to-buy', label: 'Want to buy', icon: ShoppingCartIcon },
  { to: '/shelf/dnf', label: 'Did not finish', icon: XCircleIcon }
]

export const moreNav: NavItem[] = [
  { to: '/stats', label: 'Stats', icon: ChartBarIcon }
]

export const shelfTitles: Record<string, string> = Object.fromEntries(
  shelfNav.map((s) => [s.to.replace('/shelf/', ''), s.label])
)
