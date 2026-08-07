import { defineConfig } from 'vitest/config';

import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { compression } from 'vite-plugin-compression2';

export default defineConfig({
  plugins: [
    cssInjectedByJsPlugin(),
    compression({
      algorithms: ['gzip', 'brotliCompress'],
      threshold: 1025
    })
  ],
  build: {
    emptyOutDir: true,
    outDir: '../custom_components/route_tracker/www',
    lib: {
      entry: new URL('./src/route-tracker-card.ts', import.meta.url).pathname,
      name: 'RouteTrackerCard',
      fileName: () => 'route-tracker-card.js',
      formats: ['es']
    },
    rollupOptions: {
      external: [],
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
});
