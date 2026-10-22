/** The window's top strip: drags the window; Windows draws minimise/maximise/close on the right. */
export function TitleBar() {
  return (
    <header className="drag flex h-9 shrink-0 items-center border-b border-border bg-bg pl-4 pr-[140px]">
      <span className="font-display text-[13px] font-semibold tracking-wide text-muted">Home Library</span>
    </header>
  )
}
