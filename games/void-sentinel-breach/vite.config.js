import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, 'landscape-manifest.json');

export default {
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  plugins: [{
    name: 'landscape-api',
    configureServer(server) {
      server.middlewares.use('/landscape-manifest.json', (req, res, next) => {
        if (req.method !== 'GET') return next();
        try {
          const data = fs.readFileSync(MANIFEST_PATH, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.end(data);
        } catch (e) {
          res.statusCode = 500;
          res.end(e.message);
        }
      });

      server.middlewares.use('/api/save-manifest', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('Method not allowed');
        }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            JSON.parse(body); // validate
            fs.writeFileSync(MANIFEST_PATH, body, 'utf8');
            execSync(`node ${path.join(__dirname, '../../tools/landscape-gen.js')} ${MANIFEST_PATH}`, {
              cwd: __dirname,
              stdio: 'inherit',
            });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
      });
    }
  }]
};
