import { defineConfig } from 'vitest/config'

// Integration tests against the Firestore and Auth emulators (npm run test:int).
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
