## Rendering Tier — threejs3d

Vite + Three.js. WebGL 3D — meshes, lights, cameras, materials.

### Setup
```
npm init -y
npm install vite three
```

### Project structure
```
{{game_name}}/
  package.json
  vite.config.js
  src/
    index.html
    main.js       (Three.js scene, camera, renderer, game loop)
    game.js       (game logic — entities, controls, world gen)
```

### vite.config.js
```js
export default {};
```

### Boot pattern (src/main.js)
```js
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  // update game state here
  renderer.render(scene, camera);
}
animate();
```

### src/index.html
```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>{{game_name}}</title></head>
<body style="margin:0;overflow:hidden;background:#000">
  <script type="module" src="main.js"></script>
</body>
</html>
```

### Dev server
```
npx vite        # serves on http://localhost:5173
npx vite build  # production build → dist/
```

### Notes
- Import Three.js as `import * as THREE from 'three'` — never use a CDN script tag
- Put static assets (textures, models) in `public/` — served at root, not processed by Vite
- Load textures with `new THREE.TextureLoader().load('/texture.png')`
