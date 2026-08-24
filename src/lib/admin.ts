export const SLOT_ADMIN_USER_ID = '4VSiYJso4YSWf35Rg8Cp0Q8hVmu2'

const localAdminPreview = import.meta.env.DEV
  && import.meta.env.VITE_ENABLE_LOCAL_SLOT_ADMIN === 'true'

export function isSlotAdmin(userId: string | undefined): boolean {
  return userId === SLOT_ADMIN_USER_ID || localAdminPreview
}
