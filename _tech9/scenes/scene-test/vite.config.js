import { defineConfig } from 'vite';

export default defineConfig({
  // Keep emitted asset URLs portable when mounted below a project subpath.
  base: './',
  build: { target: 'es2022' },
  server: { strictPort: true },
  preview: { strictPort: true },
});
