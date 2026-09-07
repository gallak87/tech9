# Blender MCP connection for any Codex agent

This machine uses **Blender Lab's official MCP**, installed from [Blender's MCP page](https://www.blender.org/lab/mcp-server/). The add-on is `lab_blender_org/mcp`, version 1.0.0, inside Blender 5.1. Installing the repository and enabling its MCP extension are parts of the same setup. It is a different implementation from the community `ahujasid/blender-mcp` package.

The persistent connection is the global `blender-mcp` entry in `/Users/g/.codex/config.toml`. It is available to other local Codex agents when their MCP tools initialize or reload. It does not depend on this conversation or any `/private/tmp` file.

```text
Codex → MCP over stdio → official blender-mcp process → TCP localhost:9876 → Blender add-on
```

Codex fills the LLM-client role; llama.cpp is unnecessary. Port 9876 is the add-on's internal TCP protocol, so `http://localhost:9876` is not a usable HTTP MCP endpoint.

## Configured launch command

```toml
[mcp_servers.blender-mcp]
command = "/opt/homebrew/bin/uvx"
args = ["--with", "mcp==1.30.0", "--from", "git+https://projects.blender.org/lab/blender_mcp.git@4309a39646e644261624bfcd2bca669b343b7621#subdirectory=mcp", "blender-mcp"]
```

The command installs/caches the official server through uv and launches it when Codex connects. It uses the official Git source explicitly because the public package name is shared with a different implementation. The MCP SDK is pinned: an unbounded install selected SDK 2.x, whose removal of `mcp.server.fastmcp` prevented this server from starting.

Keep the Blender add-on server running with the intended file open. Restart/reload the `blender-mcp` entry in Codex's MCP settings after changing its configuration. A task started before configuration may need its tools refreshed or a new task; a successful external probe alone does not add tools to that task's existing inventory.

## Verified on 2026-09-07

A real MCP initialization and `tools/list` request returned 26 tools. The saved global command successfully called `get_blendfile_summary_path_info` and `get_objects_summary` against the live Kaida master. Tools include Python execution, scene/object inspection, screenshots, rendering and Blender documentation search.

Python execution also authored the wave demo in the live session. A default-size viewport screenshot returned truncated JSON; `get_screenshot_of_area_as_image` succeeded with `area_ui_type="VIEW_3D"` and `size_limit_in_bytes=60000`. Use a bounded image size if a large capture fails. This records the observed workaround, not a diagnosis of every screenshot failure.

Temporary probe clients under `/private/tmp` were used to diagnose and test the connection while the current task's tool inventory was stale. They are diagnostic helpers, not the installed interface. Future agents should discover and use the configured MCP tools directly. Preserve the open document and its unsaved work; make animation experiments in separate demo masters.
