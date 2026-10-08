import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/predict": "http://localhost:8000",
      "/sensor": "http://localhost:8000",
      "/narrate": "http://localhost:8000",
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        audioDemo: resolve(__dirname, "audio-demo.html"),
      },
    },
  },
  test: {
    environment: "node",
  },
});
