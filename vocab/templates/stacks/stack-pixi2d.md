## Rendering Tier — pixi2d

Vite + Pixi.js. GPU-accelerated 2D — sprites, tilemaps, particles.

### Setup
```
npm init -y
npm install vite pixi.js
```

### Project structure
```
{{game_name}}/
  package.json
  vite.config.js
  src/
    index.html
    main.js       (Pixi app init, game loop)
    game.js       (game logic — stages, entities, input)
```

### vite.config.js
```js
export default {};
```

### Boot pattern (src/main.js)
```js
import { Application } from 'pixi.js';

const app = new Application();
await app.init({ resizeTo: window, background: '#000' });
document.body.appendChild(app.canvas);

app.ticker.add((ticker) => {
  // update each frame
});
```

### src/index.html
```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>{{game_name}}</title></head>
<body style="margin:0;overflow:hidden">
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
- Load textures with `Assets.load('path/to/sprite.png')` — Vite serves from `public/` or relative to `src/`
- Put static assets in `public/` — they're served at root and won't be hashed by Vite
