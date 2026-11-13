import { slotShareUrl, slotTargetFromHash } from './slotNavigation'

describe('shared slot addresses', () => {
  it('round-trips both identifiers and strips unrelated query parameters and routes', () => {
    const target = { pollId: 'poll /?è', slotId: 'slot/# %' }
    const url = new URL(slotShareUrl('https://bandeja-boys.web.app/?ux=nuova&notificationEvent=private&_appReload=123#fantabandeja', target))
    expect(url.origin).toBe('https://bandeja-boys.web.app')
    expect(url.search).toBe('')
    expect(slotTargetFromHash(url.hash)).toEqual(target)
  })

  it.each(['', '#fantabandeja', '#slot', '#slot/poll', '#slot//slot', '#slot/poll/', '#slot/poll/slot/extra', '#slot/%E0%A4/slot', '#slot/%20/slot'])(
    'rejects incomplete or malformed route %s', (hash) => {
      expect(slotTargetFromHash(hash)).toBeNull()
    },
  )
})
