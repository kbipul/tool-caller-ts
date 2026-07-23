import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Required for GitHub Pages: site serves from /tool-caller-ts/
  base: "/tool-caller-ts/",
  plugins: [react()],
  test: {
    environment: "node",
  },
});
