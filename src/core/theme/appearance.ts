export type AppearanceMode = "light" | "dark" | "auto";
export type EffectiveAppearance = "light" | "dark";

const APPEARANCE_ATTRIBUTE = "data-appearance";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

type AppearanceListener = (appearance: EffectiveAppearance) => void;

const listeners = new Set<AppearanceListener>();
let mode: AppearanceMode = "auto";

function resolve(target: AppearanceMode): EffectiveAppearance {
  if (target === "auto") {
    return darkQuery.matches ? "dark" : "light";
  }
  return target;
}

function apply(): void {
  const appearance = resolve(mode);
  document.documentElement.setAttribute(APPEARANCE_ATTRIBUTE, appearance);
  for (const listener of listeners) {
    listener(appearance);
  }
}

export function appearanceMode(): AppearanceMode {
  return mode;
}

export function effectiveAppearance(): EffectiveAppearance {
  return resolve(mode);
}

export function setAppearanceMode(next: AppearanceMode): void {
  mode = next;
  apply();
}

export function subscribeAppearance(listener: AppearanceListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

darkQuery.addEventListener("change", () => {
  if (mode === "auto") {
    apply();
  }
});

apply();
