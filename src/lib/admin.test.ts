import { describe, expect, it } from 'vitest'
import { isSlotAdmin, SLOT_ADMIN_USER_ID } from './admin'

describe('amministratore degli slot', () => {
  it('riconosce soltanto l’account di Jury configurato', () => {
    expect(isSlotAdmin(SLOT_ADMIN_USER_ID)).toBe(true)
    expect(isSlotAdmin('jury')).toBe(false)
    expect(isSlotAdmin(undefined)).toBe(false)
  })
})
