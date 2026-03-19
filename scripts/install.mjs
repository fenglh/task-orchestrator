#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const defaultPluginRoot = join(repoRoot, "extensions", "task-orchestrator");
const pluginId = "task-orchestrator";

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/install.mjs [openclaw.json] [options]",
      "",
      "Options:",
      "  --plugin-root <path>     Override the plugin directory to link/install.",
      "  --runner-module <path>   Explicit runEmbeddedPiAgent module path.",
      "  --skip-link              Do not run `openclaw plugins install -l ...`.",
      "  --skip-restart           Do not run `openclaw gateway restart`.",
      "  --dry-run                Print the resulting config without writing it.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    configPath: undefined,
    pluginRoot: defaultPluginRoot,
    runnerModule: undefined,
    skipLink: false,
    skipRestart: false,
    dryRun: false,
  };

  while (args.length > 0) {
    const current = args.shift();
    if (!current) {
      continue;
    }

    if (!options.configPath && !current.startsWith("--")) {
      options.configPath = current;
      continue;
    }

    if (current === "--plugin-root") {
      options.pluginRoot = args.shift();
      continue;
    }

    if (current === "--runner-module") {
      options.runnerModule = args.shift();
      continue;
    }

    if (current === "--skip-link") {
      options.skipLink = true;
      continue;
    }

    if (current === "--skip-restart") {
      options.skipRestart = true;
      continue;
    }

    if (current === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  if (!options.pluginRoot) {
    throw new Error("Missing value for --plugin-root");
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureArrayContains(list, value) {
  if (!list.includes(value)) {
    list.push(value);
  }
}

function commandExists(command) {
  try {
    execFileSync("which", [command], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function resolveCommandPath(command) {
  try {
    return execFileSync("which", [command], { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
  } catch {
    return undefined;
  }
}

function resolveNpmGlobalRoot() {
  try {
    return execFileSync("npm", ["root", "-g"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
  } catch {
    return undefined;
  }
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function deriveAncestorDirs(startPath) {
  const dirs = [];
  let current = resolve(startPath);
  let previous = "";

  while (current !== previous) {
    dirs.push(current);
    previous = current;
    current = dirname(current);
  }

  return dirs;
}

function statSafeIsFile(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function discoverOpenClawConfig(pluginRoot) {
  const envConfigPath = process.env.OPENCLAW_CONFIG;
  const candidates = [
    envConfigPath,
    join(homedir(), ".openclaw", "openclaw.json"),
  ];

  for (const dir of deriveAncestorDirs(pluginRoot)) {
    candidates.push(join(dir, ".openclaw", "openclaw.json"));
    candidates.push(join(dir, "openclaw.json"));
  }

  return unique(candidates).find((candidate) => existsSync(candidate) && statSafeIsFile(candidate));
}

function deriveCandidateRootDirs(configPath) {
  const commandPath = resolveCommandPath("openclaw");
  const roots = [
    process.cwd(),
    dirname(configPath),
    homedir(),
  ];

  if (commandPath) {
    let current = resolve(commandPath);
    for (let depth = 0; depth < 6; depth += 1) {
      current = dirname(current);
      roots.push(current);
    }
  }

  return unique(roots);
}

function discoverRunnerModule(configPath) {
  const relativeCandidates = [
    "dist/extensionAPI.js",
    "dist/agents/pi-embedded-runner.js",
    "agents/pi-embedded-runner.js",
    "src/agents/pi-embedded-runner.js",
    "src/agents/pi-embedded-runner.ts",
  ];
  const npmGlobalRoot = resolveNpmGlobalRoot();
  const openclawCommandPath = resolveCommandPath("openclaw");
  const commandPrefix = openclawCommandPath ? dirname(dirname(resolve(openclawCommandPath))) : undefined;
  const rootCandidates = unique([
    ...deriveCandidateRootDirs(configPath),
    npmGlobalRoot,
    npmGlobalRoot ? join(npmGlobalRoot, "openclaw") : undefined,
    npmGlobalRoot ? join(npmGlobalRoot, "@openclaw", "cli") : undefined,
    commandPrefix,
    commandPrefix ? join(commandPrefix, "lib", "node_modules") : undefined,
    commandPrefix ? join(commandPrefix, "lib", "node_modules", "openclaw") : undefined,
    commandPrefix ? join(commandPrefix, "lib", "node_modules", "@openclaw", "cli") : undefined,
  ]);

  for (const rootDir of rootCandidates) {
    if (statSafeIsFile(rootDir)) {
      return rootDir;
    }

    for (const relativePath of relativeCandidates) {
      const absolutePath = resolve(rootDir, relativePath);
      if (existsSync(absolutePath) && statSafeIsFile(absolutePath)) {
        return absolutePath;
      }
    }
  }

  return undefined;
}

function inferWorkspaceDir(config) {
  return unique([
    config.plugins?.entries?.[pluginId]?.config?.workspaceDir,
    config.agents?.defaults?.workspace,
    config.agents?.workspace,
    config.workspaceDir,
    config.workspace?.rootDir,
    config.workspace?.dir,
  ])[0];
}

function backupConfig(configPath) {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const backupPath = `${configPath}.bak.${pluginId}.${timestamp}`;
  writeFileSync(backupPath, readFileSync(configPath));
  return backupPath;
}

function maybeLinkPlugin(pluginRoot, warnings) {
  if (!commandExists("openclaw")) {
    warnings.push("`openclaw` command not found in PATH; skipped automatic `plugins install -l`.");
    return false;
  }

  try {
    execFileSync("openclaw", ["plugins", "install", "-l", pluginRoot], {
      stdio: "inherit",
    });
    return true;
  } catch (error) {
    warnings.push(
      `Automatic \`openclaw plugins install -l\` failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

function maybeRestartGateway(warnings) {
  if (!commandExists("openclaw")) {
    warnings.push("`openclaw` command not found in PATH; skipped automatic gateway restart.");
    return false;
  }

  try {
    execFileSync("openclaw", ["gateway", "restart"], {
      stdio: "inherit",
    });
    return true;
  } catch (error) {
    warnings.push(
      `Automatic \`openclaw gateway restart\` failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const pluginRoot = isAbsolute(options.pluginRoot)
    ? options.pluginRoot
    : resolve(process.cwd(), options.pluginRoot);
  const configPathInput = options.configPath
    ? (isAbsolute(options.configPath)
      ? options.configPath
      : resolve(process.cwd(), options.configPath))
    : discoverOpenClawConfig(pluginRoot);

  if (!configPathInput) {
    printUsage();
    throw new Error(
      "Could not auto-discover openclaw.json. Pass it explicitly or set OPENCLAW_CONFIG.",
    );
  }

  const configPath = configPathInput;

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  if (!existsSync(pluginRoot)) {
    throw new Error(`Plugin directory not found: ${pluginRoot}`);
  }

  const pluginPackagePath = join(pluginRoot, "package.json");
  if (!existsSync(pluginPackagePath)) {
    throw new Error(`Plugin package.json not found: ${pluginPackagePath}`);
  }

  const config = readJson(configPath);
  const warnings = [];

  config.plugins ??= {};
  config.plugins.enabled ??= true;
  config.plugins.load ??= {};
  config.plugins.load.paths ??= [];
  ensureArrayContains(config.plugins.load.paths, pluginRoot);
  config.plugins.allow ??= [];
  ensureArrayContains(config.plugins.allow, pluginId);
  config.plugins.entries ??= {};
  config.plugins.entries[pluginId] ??= {};
  config.plugins.entries[pluginId].enabled = true;
  config.plugins.entries[pluginId].config ??= {};

  const pluginConfig = config.plugins.entries[pluginId].config;
  const openclawDir = dirname(configPath);

  pluginConfig.workspaceDir ??= inferWorkspaceDir(config);
  pluginConfig.storageDir ??= join(openclawDir, pluginId);
  pluginConfig.sessionDir ??= join(pluginConfig.storageDir, "pi-sessions");
  pluginConfig.previewPlanByDefault ??= true;
  pluginConfig.fallbackGatewayMethod ??= "chat.send";

  if (!pluginConfig.workspaceDir) {
    warnings.push(
      "Could not infer workspaceDir from openclaw.json; set plugins.entries.task-orchestrator.config.workspaceDir manually if commands still fail.",
    );
  }

  pluginConfig.runnerModule ??=
    options.runnerModule ?? discoverRunnerModule(configPath);

  if (!pluginConfig.runnerModule) {
    warnings.push(
      "Could not auto-discover runnerModule. The plugin will rely on runtime auto-discovery. If `/task` still fails, set plugins.entries.task-orchestrator.config.runnerModule manually.",
    );
  }

  if (!options.dryRun) {
    mkdirSync(pluginConfig.storageDir, { recursive: true });
    mkdirSync(pluginConfig.sessionDir, { recursive: true });
    const backupPath = backupConfig(configPath);
    writeJson(configPath, config);
    console.log(`Updated config: ${configPath}`);
    console.log(`Backup written to: ${backupPath}`);
  } else {
    console.log(JSON.stringify(config, null, 2));
  }

  let linked = false;
  if (!options.skipLink && !options.dryRun) {
    linked = maybeLinkPlugin(pluginRoot, warnings);
  }

  let restarted = false;
  if (!options.skipRestart && !options.dryRun) {
    restarted = maybeRestartGateway(warnings);
  }

  console.log("");
  console.log("Summary");
  console.log(`- Plugin path: ${pluginRoot}`);
  console.log(`- Config path: ${configPath}`);
  console.log(`- Workspace dir: ${pluginConfig.workspaceDir ?? "(not inferred)"}`);
  console.log(`- Storage dir: ${pluginConfig.storageDir}`);
  console.log(`- Session dir: ${pluginConfig.sessionDir}`);
  console.log(`- Runner module: ${pluginConfig.runnerModule ?? "(auto-discovery at runtime)"}`);
  console.log(`- Link install: ${linked ? "completed" : options.skipLink ? "skipped" : "not completed"}`);
  console.log(`- Gateway restart: ${restarted ? "completed" : options.skipRestart ? "skipped" : "not completed"}`);

  if (warnings.length > 0) {
    console.log("");
    console.log("Warnings");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log("");
  console.log("Next steps");
  if (!restarted) {
    console.log("- Restart the OpenClaw gateway.");
  }
  console.log("- Open WebChat or dashboard and run `/task`.");
  console.log("- If `/task` still fails, inspect the gateway logs for workspaceDir/runnerModule errors.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
