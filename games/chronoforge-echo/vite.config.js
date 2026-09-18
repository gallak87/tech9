import { defineConfig } from 'vite';
export default defineConfig({
  // One portable build for / locally and /tech9/chronoforge-echo/ on Pages.
  // Vite rebases public font URLs in CSS; the atlas loader uses BASE_URL.
  base: './',
  build: { target: 'es2022' },
  server: { strictPort: true },
  preview: { strictPort: true },
});
