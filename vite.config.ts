import { defineConfig } from 'vite'

const testing = process.env.FRONTIER_E2E === '1'

export default defineConfig({
  server: testing ? { hmr: false, watch: null } : undefined,
})
