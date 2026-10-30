/// <reference types="vite/client" />

// Types for our own VITE_ variables, merged into Vite's import.meta.env
interface ImportMetaEnv {
  // Base URL of the backend API, without a trailing slash
  readonly VITE_API_URL: string
}
