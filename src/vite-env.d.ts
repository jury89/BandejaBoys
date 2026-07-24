/// <reference types="vite/client" />

declare const __BANDEJA_BUILD_ID__: string

interface ImportMetaEnv {
  readonly VITE_WEB_PUSH_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
