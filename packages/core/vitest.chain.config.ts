// Optional chain suite: needs the compiled artifact and starts a local `hardhat node`.
// Not part of the default `vitest run` (*.chain.ts files).
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['test-chain/**/*.chain.ts'], testTimeout: 60_000, hookTimeout: 90_000, fileParallelism: false },
});
