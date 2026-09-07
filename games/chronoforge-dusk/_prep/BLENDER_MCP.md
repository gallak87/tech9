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

## Use

The configured server exposes scene/object inspection, Python execution, rendering and screenshots. Use `get_blendfile_summary_path_info` and `get_objects_summary` to establish the active document before editing it.

For viewport captures, `get_screenshot_of_area_as_image` supports `area_ui_type="VIEW_3D"` and `size_limit_in_bytes=60000`. Limit image size when large captures return truncated JSON. Preserve unsaved work in open documents. Use the [current a1 source](assets/kaida/sources/a1/master.blend) for Kaida edits and evaluate the exported result in the native game.
