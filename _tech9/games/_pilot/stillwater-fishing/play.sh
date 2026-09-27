#!/bin/sh
# Local convenience launcher. Standard Node 22.13+/24+ remains supported.
set -eu
cd "$(dirname "$0")"
stillwater_node="${STILLWATER_NODE:-node}"
if ! "$stillwater_node" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>=24||(a===22&&b>=13)?0:1)' 2>/dev/null; then
  stillwater_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if ! "$stillwater_node" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>=24||(a===22&&b>=13)?0:1)' 2>/dev/null; then
  echo 'Stillwater needs Node 22.13+ (22.x) or 24+. Set STILLWATER_NODE to its executable.' >&2
  exit 1
fi
if [ ! -f node_modules/vite/bin/vite.js ]; then
  echo 'Install dependencies with npm ci using supported Node first.' >&2
  exit 1
fi
exec "$stillwater_node" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4440 --strictPort "$@"
