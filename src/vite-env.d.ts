/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public LiveKit WebSocket URL (optional; join response also returns livekit_url). */
  readonly VITE_LIVEKIT_URL?: string;
  /** Backend origin. Leave empty in local dev to use Vite `/api` proxy. */
  readonly VITE_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
