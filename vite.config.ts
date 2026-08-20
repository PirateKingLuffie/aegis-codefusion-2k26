import vinext from "vinext";
import { defineConfig } from "vite";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";
import { cloudflare } from "@cloudflare/vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    watch: {
      ...(isCodexSeatbeltSandbox
        ? { useFsEvents: false, usePolling: true }
        : {}),
      // Native build and package caches can contain hundreds of thousands of
      // files. They are never application inputs and must not trigger HMR.
      ignored: [
        "**/.gradle-user-home/**",
        "**/.gradle-cache/**",
        "**/.npm-cache/**",
        "**/platforms/android/android/.gradle/**",
        "**/platforms/android/android/**/build/**",
        "**/platforms/windows/src-tauri/target/**",
      ],
    },
  },
  // MapLibre ships its own worker bundle; Vite dependency pre-bundling can
  // otherwise move that worker between restarts and force a continuity view.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  plugins: [
    vinext({
      cache: { cdn: cdnAdapter() },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
