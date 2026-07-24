import {
  PULL_REFRESH_MAX_DISTANCE,
  isDownwardPull,
  pullRefreshUrl,
  resistedPullDistance,
} from './pullToRefresh'

describe('pull-to-refresh', () => {
  it('applica resistenza al trascinamento e limita la distanza visiva', () => {
    expect(resistedPullDistance(-20)).toBe(0)
    expect(resistedPullDistance(100)).toBe(48)
    expect(resistedPullDistance(1_000)).toBe(PULL_REFRESH_MAX_DISTANCE)
  })

  it('riconosce soltanto un gesto prevalentemente verticale verso il basso', () => {
    expect(isDownwardPull(4, 30)).toBe(true)
    expect(isDownwardPull(30, 20)).toBe(false)
    expect(isDownwardPull(0, -30)).toBe(false)
  })

  it('forza una nuova navigazione conservando query e deep link correnti', () => {
    expect(pullRefreshUrl(
      'https://bandeja-boys.web.app/?poll=poll-1#slot-slot-2',
      1_234,
    )).toBe(
      'https://bandeja-boys.web.app/?poll=poll-1&_pullRefresh=1234#slot-slot-2',
    )
  })
})
