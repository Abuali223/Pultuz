import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    // Emulyator bilan ishlash uchun ketma-ket (parallel emas) — clearFirestore() konfliktini oldini oladi.
    fileParallelism: false,
  },
});
