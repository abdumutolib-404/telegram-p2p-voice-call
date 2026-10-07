import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'], alias: [
    { find: /^lucide-react$/, replacement: fileURLToPath(new URL('./node_modules/lucide-react/dist/cjs/lucide-react.js', import.meta.url)) },
    { find: /^react$/, replacement: fileURLToPath(new URL('./node_modules/react/index.js', import.meta.url)) },
    { find: /^react\/jsx-runtime$/, replacement: fileURLToPath(new URL('./node_modules/react/jsx-runtime.js', import.meta.url)) },
    { find: /^react\/jsx-dev-runtime$/, replacement: fileURLToPath(new URL('./node_modules/react/jsx-dev-runtime.js', import.meta.url)) },
  ] },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    testTimeout: 5000,
  },
});
