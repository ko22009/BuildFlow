export function Loader({ fullScreen = false, compact = false }: { fullScreen?: boolean; compact?: boolean }) {
  return (
    <div className={`loader${fullScreen ? ' loader-screen' : ''}${compact ? ' loader-compact' : ''}`} role="status">
      <span className="loader-spinner" aria-hidden="true" />
      <span>Загрузка…</span>
    </div>
  )
}
