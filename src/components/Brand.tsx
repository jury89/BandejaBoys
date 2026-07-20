export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="Bandeja Boys">
      <span className="brand__ball" aria-hidden="true">
        <span />
      </span>
      <span className="brand__words">
        <strong>Bandeja</strong>
        <em>Boys</em>
      </span>
    </div>
  )
}

