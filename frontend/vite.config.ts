import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Vue single-file components, the Vue DevTools panel, and Tailwind (scans the source for used classes)
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
  ],
  // "@/..." imports resolve to src/, so deep files avoid long "../../" paths
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
