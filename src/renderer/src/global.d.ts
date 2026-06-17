import type { Stripe2VideoApi } from '../../../shared/types'

declare global {
  interface Window {
    api: Stripe2VideoApi
  }
}

export {}
