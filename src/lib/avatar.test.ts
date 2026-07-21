import { coverCrop } from './avatar'

describe('foto profilo', () => {
  it('ritaglia al centro una foto orizzontale', () => {
    expect(coverCrop(1200, 800)).toEqual({ sx: 200, sy: 0, sourceWidth: 800, sourceHeight: 800 })
  })

  it('ritaglia al centro una foto verticale', () => {
    expect(coverCrop(600, 1000)).toEqual({ sx: 0, sy: 200, sourceWidth: 600, sourceHeight: 600 })
  })

  it('rifiuta dimensioni non valide', () => {
    expect(() => coverCrop(0, 100)).toThrow('Immagine non valida.')
  })
})
