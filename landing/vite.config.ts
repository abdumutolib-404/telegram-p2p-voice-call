import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/",
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { fs: { allow: ['.', '../platform', '../server/src/contracts'] } },
  plugins: [react()],
  build: { target: "es2020" },
});
