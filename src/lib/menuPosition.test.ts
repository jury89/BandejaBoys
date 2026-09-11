import { positionSlotMenu } from './menuPosition'

const bounds = { top: 76, bottom: 700, left: 8, right: 382 }
const anchor = { top: 180, bottom: 224, left: 240, right: 366 }

describe('posizionamento del menu dello slot', () => {
  it('apre sotto quando tutte le azioni hanno spazio', () => {
    expect(positionSlotMenu(anchor, bounds, 250, 254)).toEqual({ side: 'below', top: 228, left: 116, width: 250, maxHeight: 472 })
  })
  it('apre sopra uno slot visibile solo nella parte bassa dello schermo', () => {
    expect(positionSlotMenu({ ...anchor, top: 540, bottom: 584 }, bounds, 250, 254)).toEqual({ side: 'above', top: 282, left: 116, width: 250, maxHeight: 460 })
  })
  it('limita l’altezza al lato più spazioso quando serve scorrere', () => {
    const result = positionSlotMenu({ ...anchor, top: 220, bottom: 264 }, { ...bounds, bottom: 380 }, 250, 254)
    expect(result.side).toBe('above')
    expect(result.top).toBe(bounds.top)
    expect(result.maxHeight).toBe(140)
  })
  it('mantiene sotto il menu che ci sta anche quando sopra c’è più spazio', () => {
    expect(positionSlotMenu({ ...anchor, top: 440, bottom: 484 }, bounds, 250, 180).side).toBe('below')
  })
  it('rispetta i bordi orizzontali e il viewport spostato dallo zoom', () => {
    const result = positionSlotMenu({ top: 200, bottom: 244, left: 110, right: 180 }, { top: 100, bottom: 500, left: 100, right: 300 }, 250, 180)
    expect(result).toEqual({ side: 'below', top: 248, left: 100, width: 200, maxHeight: 252 })
  })
})
