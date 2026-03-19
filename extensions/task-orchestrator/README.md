# Task Orchestrator Plugin

Native OpenClaw plugin wrapper around the task orchestrator runtime in `src/task-orchestrator`.

## Purpose

This plugin exposes the orchestrator through:

- Gateway RPC methods:
  - `task-orchestrator.start`
  - `task-orchestrator.resume`
  - `task-orchestrator.pause`
  - `task-orchestrator.cancel`
  - `task-orchestrator.status`
  - `task-orchestrator.refine`
  - `task-orchestrator.retry`
  - `task-orchestrator.skip`
  - `task-orchestrator.route`
  - `task-orchestrator.recover`
- Slash commands:
  - `/task <subcommand>`
  - `/taskstatus`
  - `/taskroute <message>`

The recommended chat-window entrypoint is now `/task ...`, for example:

- `/task start 帮我做京东洗地机竞品分析，自动拆解并执行`
- `/task status`
- `/task tree`
- `/task resume`

## Required config

The plugin manifest no longer requires explicit paths in the happy path.

`workspaceDir` is optional. If omitted, the plugin will try to inherit the host OpenClaw workspace directory from `api.config`.

`runnerModule` is also optional. If omitted, the plugin will try these locations relative to the host root directory:

- `./dist/extensionAPI.js` (recommended for current OpenClaw builds)
- `./dist/agents/pi-embedded-runner.js`
- `./agents/pi-embedded-runner.js`
- `./src/agents/pi-embedded-runner.js`
- `./src/agents/pi-embedded-runner.ts`

If your OpenClaw project exports `runEmbeddedPiAgent()` from a different location, set `runnerModule` explicitly. For the OpenClaw version installed on this machine, the working value is:

- `/opt/homebrew/lib/node_modules/openclaw/dist/extensionAPI.js`

If `fallbackGatewayMethod` is omitted, the plugin will try the official core gateway method `chat.send` first.

Example shape:

```json
{
  "plugins": {
    "entries": {
      "task-orchestrator": {
        "enabled": true,
        "config": {
          "storageDir": "/srv/openclaw/state/task-orchestrator",
          "sessionDir": "/srv/openclaw/state/task-orchestrator/pi-sessions",
          "runnerModule": "/opt/homebrew/lib/node_modules/openclaw/dist/extensionAPI.js",
          "runnerExport": "runEmbeddedPiAgent",
          "provider": "anthropic",
          "model": "claude-sonnet-4-20250514",
          "timeoutMs": 120000,
          "fallbackGatewayMethod": "chat.send",
          "progressGatewayMethod": "chat.push"
        }
      }
    }
  }
}
```

## Development note

The plugin runtime currently loads `runEmbeddedPiAgent()` via dynamic import because the public plugin SDK docs do not expose a dedicated embedded-pi runner helper for third-party plugins.

## Helper installer

This repo also ships a helper installer script for local/manual deployments:

```bash
node scripts/install.mjs
```

Or pass the config path explicitly:

```bash
node scripts/install.mjs /path/to/openclaw.json
```

It will:

- add the plugin path to `plugins.load.paths`
- add `task-orchestrator` to `plugins.allow`
- enable `plugins.entries.task-orchestrator`
- populate `workspaceDir`, `storageDir`, `sessionDir`, and sensible defaults
- try to auto-discover `runnerModule`
- optionally run `openclaw plugins install -l <pluginRoot>`
- restart the Gateway via `openclaw gateway restart`
