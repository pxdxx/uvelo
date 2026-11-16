/// <reference types="vite/client" />
import type { UveloApi } from '@shared/types'
declare global {
  interface Window {
    uvelo: UveloApi
  }
}
declare module 'world-atlas/countries-50m.json'
declare module 'world-atlas/countries-110m.json'
