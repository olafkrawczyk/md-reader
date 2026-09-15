import type { ExtensionDescriptor } from "../core/extension";
import { markdownExtension } from "./markdown";
import { gfmExtension } from "./gfm";
import { taskTicksExtension } from "./taskTicks";
import { shikiExtension } from "./shiki";
import { editorExtension } from "./editor";
import { readerExtension } from "./reader";
import { sidebarExtension } from "./sidebar";
import { themeExtension } from "./theme";
import { presetsExtension } from "./presets";
import { searchExtension } from "./search";
import { documentSafetyExtension } from "./documentSafety";
import { fileManagementExtension } from "./fileManagement";

/**
 * The built-in pack, in activation order. @mdr/markdown claims the
 * markdown pipeline first; the buffered transformer registry makes the
 * gfm/shiki order irrelevant regardless. @mdr/search comes last so the
 * editor and reader panes mount before its target registry is served.
 */
export const builtinExtensions: readonly ExtensionDescriptor[] = [
  markdownExtension,
  gfmExtension,
  taskTicksExtension,
  shikiExtension,
  editorExtension,
  readerExtension,
  sidebarExtension,
  fileManagementExtension,
  themeExtension,
  presetsExtension,
  searchExtension,
  documentSafetyExtension,
];
