import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Work around tinypool/threads teardown issues seen on some Node versions.
    pool: 'forks',
    fileParallelism: false,
  },
});


