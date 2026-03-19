import { pathToFileURL } from "node:url";
import { isAbsolute, resolve } from "node:path";
import type { OpenClawEmbeddedPiRunner } from "./types.ts";

export interface RunnerModuleLoadOptions {
  runnerModule?: string;
  runnerExport?: string;
  baseDir?: string;
  candidateModules?: string[];
}

interface RunnerModuleShape {
  runEmbeddedPiAgent?: OpenClawEmbeddedPiRunner["runEmbeddedPiAgent"];
  default?: OpenClawEmbeddedPiRunner["runEmbeddedPiAgent"];
  [key: string]: unknown;
}

function isBareModuleSpecifier(specifier: string): boolean {
  return (
    !specifier.startsWith("./") &&
    !specifier.startsWith("../") &&
    !specifier.startsWith("/") &&
    !specifier.startsWith("file:")
  );
}

function resolveImportSpecifier(specifier: string, baseDir?: string): string {
  if (specifier.startsWith("file:") || isBareModuleSpecifier(specifier)) {
    return specifier;
  }

  if (isAbsolute(specifier)) {
    return pathToFileURL(specifier).href;
  }

  return pathToFileURL(resolve(baseDir ?? process.cwd(), specifier)).href;
}

export async function createRunnerFromModule(
  options: RunnerModuleLoadOptions,
): Promise<OpenClawEmbeddedPiRunner> {
  const candidateModules = [
    options.runnerModule,
    ...(options.candidateModules ?? []),
  ].filter((value): value is string => Boolean(value && value.trim()));
  const exportName = options.runnerExport ?? "runEmbeddedPiAgent";

  if (candidateModules.length === 0) {
    throw new Error("No runner module candidates were provided");
  }

  const attempted: string[] = [];

  for (const runnerModule of candidateModules) {
    const specifier = resolveImportSpecifier(runnerModule, options.baseDir);
    attempted.push(runnerModule);

    try {
      const loaded = (await import(specifier)) as RunnerModuleShape;
      const candidate =
        (loaded[exportName] as OpenClawEmbeddedPiRunner["runEmbeddedPiAgent"] | undefined) ??
        loaded.runEmbeddedPiAgent ??
        loaded.default;

      if (typeof candidate === "function") {
        return {
          runEmbeddedPiAgent: candidate,
        };
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    `Unable to load runEmbeddedPiAgent from any runner module candidate: ${attempted.join(", ")}`,
  );
}
