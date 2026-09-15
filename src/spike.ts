import { invoke } from "@tauri-apps/api/core";

type SpikePath = "custom-scheme" | "blob-fallback";

interface SpikeModule {
  greet?: unknown;
}

export interface SpikeAttempt {
  path: SpikePath;
  success: boolean;
  detail: string;
}

export interface SpikeSummary {
  attempts: SpikeAttempt[];
  workingPath: SpikePath | null;
}

function isGreet(value: unknown): value is (name: string) => string {
  return typeof value === "function";
}

async function importAndCallGreet(
  moduleUrl: string,
): Promise<{ ok: true; reply: string } | { ok: false; detail: string }> {
  const mod: SpikeModule = await import(/* @vite-ignore */ moduleUrl);
  if (!isGreet(mod.greet)) {
    return { ok: false, detail: "module loaded but greet export missing" };
  }
  return { ok: true, reply: mod.greet("spike") };
}

async function tryCustomScheme(): Promise<SpikeAttempt> {
  const path: SpikePath = "custom-scheme";
  try {
    const result = await importAndCallGreet("mdext://spike/main.js");
    if (!result.ok) {
      return { path, success: false, detail: result.detail };
    }
    return {
      path,
      success: result.reply === "hello, spike",
      detail: `greet() returned "${result.reply}"`,
    };
  } catch (err) {
    return { path, success: false, detail: String(err) };
  }
}

async function tryBlobFallback(): Promise<SpikeAttempt> {
  const path: SpikePath = "blob-fallback";
  try {
    const source = await invoke<string>("read_extension_source", {
      extensionId: "spike",
      file: "main.js",
    });
    const blobUrl = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    const result = await importAndCallGreet(blobUrl);
    URL.revokeObjectURL(blobUrl);
    if (!result.ok) {
      return { path, success: false, detail: result.detail };
    }
    return {
      path,
      success: result.reply === "hello, spike",
      detail: `greet() returned "${result.reply}"`,
    };
  } catch (err) {
    return { path, success: false, detail: String(err) };
  }
}

export async function runSpike(): Promise<SpikeSummary> {
  const attempts: SpikeAttempt[] = [await tryCustomScheme()];
  if (attempts[0]?.success) {
    return { attempts, workingPath: "custom-scheme" };
  }
  attempts.push(await tryBlobFallback());
  return {
    attempts,
    workingPath: attempts.find((attempt) => attempt.success)?.path ?? null,
  };
}
