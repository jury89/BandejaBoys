import { useEffect, type RefObject } from 'react'
import { positionSlotMenu } from '../lib/menuPosition'

export function useSlotMenuPosition(ref: RefObject<HTMLDetailsElement | null>, enabled: boolean) {
  useEffect(() => {
    const menu = ref.current
    const panel = menu?.querySelector<HTMLElement>('.slot-card__management')
    if (!enabled || !menu || !panel) return
    let frame = 0
    let stopWatching = () => {}

    const position = () => {
      if (!menu.open) return
      const viewport = window.visualViewport
      const top = viewport?.offsetTop ?? 0
      const left = viewport?.offsetLeft ?? 0
      const height = viewport?.height ?? window.innerHeight
      const width = viewport?.width ?? window.innerWidth
      const bounds = { top: top + 8, bottom: top + height - 8, left: left + 8, right: left + width - 8 }
      // Reserve the actual occupied space, including the iPhone safe area.
      menu.closest('.app-shell')?.querySelectorAll('.topbar, .club-navigation').forEach((chrome) => {
        const rect = chrome.getBoundingClientRect()
        if (!rect.height || rect.bottom <= top || rect.top >= top + height) return
        if (rect.top <= top) bounds.top = Math.max(bounds.top, rect.bottom + 8)
        else if (rect.bottom >= top + height) bounds.bottom = Math.min(bounds.bottom, rect.top - 8)
      })
      const anchor = menu.getBoundingClientRect()
      if (anchor.bottom <= bounds.top || anchor.top >= bounds.bottom) {
        menu.open = false
        return
      }
      const panelStyle = getComputedStyle(panel)
      const naturalHeight = panel.scrollHeight + (parseFloat(panelStyle.borderTopWidth) || 0) + (parseFloat(panelStyle.borderBottomWidth) || 0)
      const placement = positionSlotMenu(anchor, bounds, Math.min(250, width - 56), naturalHeight)
      menu.dataset.placement = placement.side
      panel.style.setProperty('--slot-menu-top', `${placement.top - anchor.top}px`)
      panel.style.setProperty('--slot-menu-left', `${placement.left - anchor.left}px`)
      panel.style.setProperty('--slot-menu-width', `${placement.width}px`)
      panel.style.setProperty('--slot-menu-max-height', `${placement.maxHeight}px`)
    }
    const schedule = (event?: Event) => {
      // Scrolling the menu itself must not move it or reset its scroll position.
      if (event?.type === 'scroll' && event.target instanceof Node && panel.contains(event.target)) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(position)
    }
    const toggle = () => {
      stopWatching()
      if (!menu.open) return
      panel.scrollTop = 0
      position()
      document.addEventListener('scroll', schedule, true)
      window.addEventListener('resize', schedule)
      window.visualViewport?.addEventListener('resize', schedule)
      window.visualViewport?.addEventListener('scroll', schedule)
      const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => schedule())
      observer?.observe(menu)
      observer?.observe(panel)
      stopWatching = () => {
        cancelAnimationFrame(frame)
        document.removeEventListener('scroll', schedule, true)
        window.removeEventListener('resize', schedule)
        window.visualViewport?.removeEventListener('resize', schedule)
        window.visualViewport?.removeEventListener('scroll', schedule)
        observer?.disconnect()
      }
    }
    menu.addEventListener('toggle', toggle)
    if (menu.open) toggle()
    return () => {
      menu.removeEventListener('toggle', toggle)
      stopWatching()
    }
  }, [ref, enabled])
}
