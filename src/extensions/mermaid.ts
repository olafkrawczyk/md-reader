import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import { renderMermaidKey } from "./markdownContract";
import { createMermaidService } from "./mermaidService";

/**
 * Mermaid is ~1MB+ of JavaScript, so it is reached only through this dynamic
 * import: the chunk downloads on first diagram, never at startup. The service
 * is registered immediately — it is cheap until something calls render.
 */
async function activate(api: ExtensionApi): Promise<void> {
  const service = createMermaidService({
    load: () => import("mermaid").then((m) => m.default),
    // mermaid.render leaves scratch elements in <body> when it throws.
    removeTemp: (id) => {
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    },
  });
  api.services.register(renderMermaidKey, service);
}

export const mermaidExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/mermaid",
    displayName: "Mermaid diagrams",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
