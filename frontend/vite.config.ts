import { compression } from 'vite-plugin-compression2';

import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: new URL('./src/route-tracker-card.ts', import.meta.url).pathname,
      fileName: () => 'route-tracker-card.js',
      formats: ['es'],
      name: 'RouteTrackerCard',
    },
    outDir: '../custom_components/route_tracker/www',
    rollupOptions: {
      external: [],
    },
  },
  plugins: [
    cssInjectedByJsPlugin(),
    compression({
      algorithms: ['gzip', 'brotliCompress'],
      threshold: 1025,
    }),
  ],
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text'],
    },
    environment: 'happy-dom',
  },
});
