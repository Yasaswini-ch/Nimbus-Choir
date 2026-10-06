import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
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
