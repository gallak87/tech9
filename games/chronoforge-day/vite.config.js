export default {
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: { output: { manualChunks(id) {
      if (id.includes('/node_modules/three/')) return 'three';
    } } },
  },
};
