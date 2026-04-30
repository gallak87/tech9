## Rendering Tier — canvas2d

Vite + vanilla JS. No renderer dep — just the browser Canvas API.

### Setup
```
npm init -y
npm install vite
```

### Project structure
```
{{game_name}}/
  package.json
  vite.config.js
  src/
    index.html
    main.js       (canvas init, game loop)
    game.js       (game logic)
```

### vite.config.js
```js
export default {};
```

### Boot pattern (src/main.js)
```js
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

function loop() {
  requestAnimationFrame(loop);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // update + draw
}
loop();
```

### src/index.html
```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>{{game_name}}</title></head>
<body style="margin:0;overflow:hidden;background:#000">
  <canvas id="game"></canvas>
  <script type="module" src="main.js"></script>
</body>
</html>
```

### Dev server
```
npx vite        # serves on http://localhost:5173
npx vite build  # production build → dist/
```
