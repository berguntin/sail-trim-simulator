import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // Honour the PORT env var (used by preview tooling); default 5173
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/physics/**'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
})
