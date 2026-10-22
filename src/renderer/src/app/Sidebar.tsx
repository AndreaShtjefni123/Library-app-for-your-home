import { NavLink } from 'react-router'
import { GearIcon, MoonIcon, SidebarSimpleIcon, SunIcon } from '@phosphor-icons/react'
import { mainNav, moreNav, shelfNav, type NavItem } from './nav'
import { useUi } from '../stores/ui'
import { useShelfCounts } from '../lib/queries'

function Item({ item, collapsed, count }: { item: NavItem; collapsed: boolean; count?: number }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        [
          'flex h-9 items-center gap-3 rounded-md px-3 text-[14px] transition-colors',
          item.nested && !collapsed ? 'ml-5 h-8 text-[13px]' : '',
          isActive ? 'bg-accent-soft font-medium text-ink' : 'text-muted hover:bg-surface hover:text-ink'
        ].join(' ')
      }
    >
      <Icon size={item.nested ? 16 : 18} weight="regular" className="shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && count !== undefined && count > 0 && (
        <span className="text-[12px] tabular-nums text-muted" aria-label={`${count} books`}>
          {count.toLocaleString()}
        </span>
      )}
    </NavLink>
  )
}

function SectionLabel({ children, collapsed }: { children: string; collapsed: boolean }) {
  if (collapsed) return <div className="mx-3 my-2 border-t border-border" />
  return (
    <div className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</div>
  )
}

export function Sidebar() {
  const { sidebarCollapsed: collapsed, toggleSidebar, mode, toggleMode } = useUi()
  const { data: counts } = useShelfCounts()

  return (
    <nav
      aria-label="Main"
      className={`flex shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {mainNav.map((item) => (
          <Item key={item.to} item={item} collapsed={collapsed} count={item.to === '/library' ? counts?.all : undefined} />
        ))}
        <SectionLabel collapsed={collapsed}>Shelves</SectionLabel>
        {shelfNav.map((item) => (
          <Item
            key={item.to}
            item={item}
            collapsed={collapsed}
            count={counts?.[item.to.replace('/shelf/', '') as keyof typeof counts]}
          />
        ))}
        <SectionLabel collapsed={collapsed}>More</SectionLabel>
        {moreNav.map((item) => (
          <Item key={item.to} item={item} collapsed={collapsed} />
        ))}
      </div>

      <div className="border-t border-border px-2 py-2">
        <Item item={{ to: '/settings', label: 'Settings', icon: GearIcon }} collapsed={collapsed} />
        <div className={`mt-1 flex ${collapsed ? 'flex-col' : ''} gap-1`}>
          <button
            type="button"
            onClick={toggleMode}
            className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-muted hover:bg-surface hover:text-ink"
            title={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            aria-label={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {mode === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
            {!collapsed && <span className="text-[13px]">{mode === 'light' ? 'Dark' : 'Light'}</span>}
          </button>
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex h-9 w-9 items-center justify-center self-center rounded-md text-muted hover:bg-surface hover:text-ink"
            title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <SidebarSimpleIcon size={18} />
          </button>
        </div>
      </div>
    </nav>
  )
}
