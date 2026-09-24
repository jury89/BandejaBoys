import styles from './clubhouse.css?raw'

// Geometry is also exercised in the browser: these guards prevent broad legacy
// selectors from accidentally overriding the sizing contracts again.
function declarations(selector: string) {
  const start = styles.indexOf(`${selector} {`)
  expect(start, `Missing rule: ${selector}`).toBeGreaterThanOrEqual(0)
  return styles.slice(start + selector.length + 2, styles.indexOf('}', start))
}

describe('geometria Clubhouse', () => {
  it('ancora la navigazione al viewport dinamico senza il bottom-fixed difettoso su iOS', () => {
    const frame = declarations('.club-navigation-frame')
    expect(frame).toContain('position: fixed;')
    expect(frame).toContain('inset: 0 0 auto;')
    expect(frame.indexOf('height: 100dvh;')).toBeGreaterThan(frame.indexOf('height: 100vh;'))
    expect(frame).toContain('align-items: flex-end;')
    expect(frame).toContain('pointer-events: none;')
    const nav = declarations('.club-navigation')
    expect(nav).toContain('pointer-events: auto;')
    expect(nav).toContain('env(safe-area-inset-bottom)')
    expect(nav).not.toMatch(/(?:position|inset|bottom|transform)\s*:/)
    const desktop = styles.slice(styles.indexOf('@media (min-width: 1050px)'))
    expect(desktop).toContain('.club-navigation-frame { height: 76px; align-items: center; justify-content: center; }')
    expect(declarations('body.modal-open .club-navigation')).toContain('visibility: hidden;')
  })

  it('mantiene il campo a due colonne e due metà anche su desktop', () => {
    const court = declarations('.club-roster')
    expect(court).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(court).toContain('grid-template-rows: repeat(2, minmax(0, 1fr))')
    expect(court).toContain('background: var(--court)')
    expect(styles).not.toContain('.club-roster { grid-template-columns: repeat(4,')
    expect(declarations('.club-roster__net')).toContain('top: 50%')
  })
  it('riduce solo lo spazio verticale senza bloccare la crescita per nomi lunghi e ospiti', () => {
    const court = declarations('.club-roster')
    expect(court).toContain('min-height: 220px;')
    expect(court).toContain('margin: 0 16px 16px;')
    expect(court).toContain('padding: 12px;')
    expect(court).toContain('gap: 24px;')
    const courtRules = [...styles.matchAll(/\.club-roster \{([^}]+)\}/g)].map((match) => match[1])
    expect(courtRules).toHaveLength(2)
    expect(courtRules[1]).toContain('padding: 16px 20px; min-height: 210px;')
    for (const rule of courtRules) {
      expect(rule).not.toMatch(/(?:^|;)\s*(?:height|max-height|width|max-width|overflow)\s*:/)
    }
  })
  it('mantiene circolari foto e iniziali del profilo statistiche', () => {
    const avatar = declarations('.app-shell.ux-new .player-stats__hero-avatar')
    expect(avatar).toContain('width: 68px; height: 68px; flex: 0 0 68px;')
    expect(avatar).toContain('place-items: center;')
    expect(avatar).toContain('line-height: 1;')
    expect(styles).not.toContain('.app-shell.ux-new .player-stats__identity span {')
  })

  it('non allunga checkbox e radio come se fossero campi di testo', () => {
    expect(declarations('.app-shell.ux-new .modal :is(input:not([type=checkbox]):not([type=radio]), select)')).toContain('min-height: 46px;')
    expect(styles).not.toContain('.app-shell.ux-new .modal :is(input, select) {')
    expect(declarations('.app-shell.ux-new .profile-fixed-seat__switch')).toContain('min-height: 44px;')
  })

  it('lascia scorrere il menu account entro lo spazio tra header e navigazione', () => {
    const menu = declarations('.app-shell.ux-new .account-menu__popover')
    expect(menu).toContain('100dvh - var(--club-header) - var(--club-navigation)')
    expect(menu).toContain('overflow-y: auto;')
    expect(menu).toContain('overscroll-behavior: contain;')
    expect(declarations('.app-shell.ux-new .account-menu__popover > *')).toContain('flex-shrink: 0;')
  })
})
