import type { StateCreator } from 'zustand'

export interface SyncSlice {
  // Empty for now - sync logic is handled in offline slice
  // This exists for future expansion of sync functionality
}

export const createSyncSlice: StateCreator<
  SyncSlice,
  [['zustand/immer', never], ['zustand/devtools', never], ['zustand/subscribeWithSelector', never]],
  [],
  SyncSlice
> = (set, get) => ({
  // Future sync functionality will be added here
})