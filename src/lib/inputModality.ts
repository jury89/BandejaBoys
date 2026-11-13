// Text fields can match :focus-visible even when focused by an iOS tap.
// Track direct interaction separately; virtual-keyboard typing must not reset it.
export function watchInputModality(target: Document = document): () => void {
  const root = target.documentElement
  const attribute = 'data-input-modality'
  const previous = root.getAttribute(attribute)
  const set = (value: string) => root.setAttribute(attribute, value)
  const onPointerDown = (event: PointerEvent) => {
    set(event.pointerType === 'touch' || event.pointerType === 'pen' ? 'touch' : 'pointer')
  }
  const onTouchStart = () => set('touch')
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) set('keyboard')
  }

  target.addEventListener('pointerdown', onPointerDown, true)
  target.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
  target.addEventListener('keydown', onKeyDown, true)

  return () => {
    target.removeEventListener('pointerdown', onPointerDown, true)
    target.removeEventListener('touchstart', onTouchStart, true)
    target.removeEventListener('keydown', onKeyDown, true)
    if (previous === null) root.removeAttribute(attribute)
    else root.setAttribute(attribute, previous)
  }
}
