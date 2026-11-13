import { defineConfig } from 'vite';
export default defineConfig({
  publicDir: false,
  build: { outDir: '../assets/ditto', emptyOutDir: false, minify: true, copyPublicDir: false, modulePreload: false,
    lib: { entry: 'app.js', formats: ['es'], fileName: () => 'app.js' } },
});
