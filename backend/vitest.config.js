import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/unit/**/*.test.js',
      'tests/integration/**/*.test.js'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.js'],
      exclude: [
        'src/index.js',
        'src/bootstrap.js',
        'src/models/database.js' // Database is hard to unit test
      ]
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // Reporter for better output
    reporters: ['verbose'],
    // Ensure tests are isolated
    isolate: true
  }
});
