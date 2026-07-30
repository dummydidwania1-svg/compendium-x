import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    // Scoped deliberately to lib/goalTracker — this is the one module in the
    // repo pure/deterministic enough to warrant unit tests; the rest of the
    // app is verified manually/via the Firebase emulator, per existing convention.
    include: ['lib/goalTracker/**/*.test.ts'],
  },
})
