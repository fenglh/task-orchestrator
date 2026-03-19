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
  - `/taskstatus`
  - `/taskroute <message>`

## Required config

The plugin manifest no longer requires explicit paths in the happy path.

`workspaceDir` is optional. If omitted, the plugin will try to inherit the host OpenClaw workspace directory from `api.config`.

`runnerModule` is also optional. If omitted, the plugin will try these locations relative to the host root directory:

- `./dist/agents/pi-embedded-runner.js`
- `./agents/pi-embedded-runner.js`
- `./src/agents/pi-embedded-runner.js`
- `./src/agents/pi-embedded-runner.ts`

If your OpenClaw project exports `runEmbeddedPiAgent()` from a different location, set `runnerModule` explicitly.

If `fallbackGatewayMethod` is omitted, the plugin will try the official core gateway method `chat.send` first.

Example shape:

```json
{
  "plugins": {
    "entries": {
      "task-orchestrator": {
        "enabled": true,
        "storageDir": "/srv/openclaw/state/task-orchestrator",
        "sessionDir": "/srv/openclaw/state/task-orchestrator/pi-sessions",
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
```

## Development note

The plugin runtime currently loads `runEmbeddedPiAgent()` via dynamic import because the public plugin SDK docs do not expose a dedicated embedded-pi runner helper for third-party plugins.
