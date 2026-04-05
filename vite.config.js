import { dirname , resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ometiff: resolve(import.meta.dirname, 'ometiff.html'),
        dicomweb: resolve(import.meta.dirname, 'dicomweb.html'),
      },
    },
  },
});
