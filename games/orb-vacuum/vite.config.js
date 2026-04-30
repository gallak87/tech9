import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  base: '/tech9/orb-vacuum/',
  publicDir: false,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: '_chunks',
  },
});
