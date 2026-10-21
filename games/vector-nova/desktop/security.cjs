const { createReadStream } = require('node:fs');
const { stat } = require('node:fs/promises');
const { Readable } = require('node:stream');
const { resolve, sep, extname } = require('node:path');
const ORIGIN = 'vn-game://app';
const CSP =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
// Emscripten's shipped Basis bindings use Function constructors. Only the
// dedicated sandboxed worker receives this exception; the document never does.
const DECODER_CSP = CSP.replace(
  "script-src 'self' 'wasm-unsafe-eval'",
  "script-src 'self' 'unsafe-eval'",
);
function resourcePath(url, root) {
  let parsed, pathname;
  try {
    parsed = new URL(url);
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'vn-game:' ||
    parsed.host !== 'app' ||
    parsed.username ||
    parsed.password ||
    pathname.includes('\\') ||
    pathname.includes('\0')
  )
    return null;
  if (pathname.split('/').some((part) => part === '..' || part === '.'))
    return null;
  const path = resolve(
    root,
    '.' + (pathname === '/' ? '/index.html' : pathname),
  );
  return path.startsWith(resolve(root) + sep) ? path : null;
}
function trustedSender(event, window) {
  if (
    !window ||
    window.isDestroyed() ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    return false;
  try {
    const url = new URL(event.senderFrame.url);
    return url.protocol === 'vn-game:' && url.host === 'app';
  } catch {
    return false;
  }
}
function forbiddenArguments(args) {
  return args.some((arg) =>
    /^--(?:inspect(?:-brk|-port)?|remote-debugging-[\w-]+|load-extension|disable-web-security|no-sandbox|js-flags)(?:=|$)/i.test(
      arg,
    ),
  );
}
function mime(path) {
  return (
    {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.wasm': 'application/wasm',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.svg': 'image/svg+xml',
    }[extname(path)] ?? 'application/octet-stream'
  );
}
async function serveResource(request, root) {
  const path = resourcePath(request.url, root);
  if (!path || !['GET', 'HEAD'].includes(request.method))
    return new Response('Not found', { status: 404 });
  try {
    const info = await stat(path);
    if (!info.isFile()) return new Response('Not found', { status: 404 });
    let start = 0,
      end = info.size - 1,
      status = 200;
    const headers = {
      'Content-Type': mime(path),
      'Content-Security-Policy':
        path === resolve(root, 'assets/decoder-worker.js') ? DECODER_CSP : CSP,
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    };
    const range = request.headers.get('range');
    if (range) {
      const parts = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!parts || (!parts[1] && !parts[2]))
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${info.size}` },
        });
      if (!parts[1]) start = Math.max(0, info.size - Number(parts[2]));
      else {
        start = Number(parts[1]);
        if (parts[2]) end = Math.min(end, Number(parts[2]));
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= info.size
      )
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${info.size}` },
        });
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    }
    headers['Content-Length'] = String(Math.max(0, end - start + 1));
    const body =
      request.method === 'HEAD' || info.size === 0
        ? null
        : Readable.toWeb(createReadStream(path, { start, end }));
    return new Response(body, { status, headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
module.exports = {
  serveResource,
  ORIGIN,
  CSP,
  resourcePath,
  trustedSender,
  forbiddenArguments,
  mime,
};
