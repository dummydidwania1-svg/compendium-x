import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // 'server-only' is a Next.js runtime guard package; stub it so
      // server-only modules (vertexInsight) can be unit-tested.
      'server-only': path.resolve(__dirname, 'lib/goalTracker/__mocks__/server-only.ts'),
    },
  },
  test: {
    // Scoped deliberately to pure/deterministic modules (goal-tracker engine,
    // caseSignals) — the rest of the app is verified manually/via the Firebase
    // emulator, per existing convention.
    include: ['lib/goalTracker/**/*.test.ts', 'lib/caseSignals.test.ts'],
  },
})
