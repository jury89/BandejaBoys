interface MenuBounds {
  top: number
  bottom: number
  left: number
  right: number
}

/** Coordinates are viewport-relative; bounds already exclude fixed navigation. */
export function positionSlotMenu(anchor: MenuBounds, bounds: MenuBounds, width: number, naturalHeight: number) {
  const gap = 4
  const below = Math.max(0, bounds.bottom - anchor.bottom - gap)
  const above = Math.max(0, anchor.top - bounds.top - gap)
  const side = naturalHeight > below && above > below ? 'above' : 'below'
  const maxHeight = side === 'above' ? above : below
  const height = Math.min(naturalHeight, maxHeight)
  const menuWidth = Math.min(width, Math.max(0, bounds.right - bounds.left))
  const left = Math.max(bounds.left, Math.min(anchor.right - menuWidth, bounds.right - menuWidth))
  const top = side === 'above' ? anchor.top - gap - height : anchor.bottom + gap
  return { side, top, left, width: menuWidth, maxHeight }
}
