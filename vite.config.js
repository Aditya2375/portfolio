import { defineConfig } from 'vite';
export default defineConfig({
  publicDir: false,
  build: { outDir: 'assets/ditto', emptyOutDir: false, minify: true, copyPublicDir: false, modulePreload: false,
    lib: { entry: 'src/app.js', formats: ['es'], fileName: () => 'app.js' } },
});
