import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Separate from vite.config.ts so the app build stays free of test concerns.
// Vitest prefers this file when both exist.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // jsdom, not node: Node 26 still has no global DOMParser (needed to assert
      // the emitted SVG actually parses), and it gives us HTMLCanvasElement to
      // patch plus a DOM for the component tests. It is pure JS — unlike the
      // native `canvas` package, which we deliberately avoid.
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      restoreMocks: true,
    },
  }),
);
