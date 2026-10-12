import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { servePublicApi } from './public-api';
export default defineConfig(({ mode }) => {
  const config = loadEnv(mode, process.cwd(), 'PUBLIC_');
  const publicApi: Plugin = {
    name: 'pairtalk-public-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const response = await servePublicApi(new Request(new URL(req.url, 'http://127.0.0.1'), { method: req.method }), config.PUBLIC_API_ORIGIN || 'https://api.pairtalk.online');
        if (!response) return next();
        res.statusCode = response.status;
        response.headers.forEach((value, name) => res.setHeader(name, value));
        res.end(await response.text());
      });
    },
  };
  return {
    base: "/",
    resolve: { dedupe: ['react', 'react-dom'] },
    server: { fs: { allow: ['.', '../platform', '../server/src/contracts'] } },
    plugins: [react(), publicApi],
    build: { target: "es2020" },
  };
});
