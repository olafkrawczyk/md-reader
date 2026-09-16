import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Columns2,
  Compass,
  Eye,
  File,
  FileCode,
  FilePlus,
  FileText,
  Focus,
  Folder,
  FolderOpen,
  FolderPlus,
  Link2,
  ListTree,
  PanelLeft,
  Pen,
  Search,
  Settings,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

/**
 * The app's single icon vocabulary: a fixed set of stroke icons, sized and
 * weighted consistently. Icons inherit `currentColor`, so appearance
 * switches re-tint them through the text token.
 */

interface IconProps {
  readonly size?: number;
}

function withDefaults(size: number, children: JSX.Element): JSX.Element {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        width: size,
        height: size,
      }}
    >
      {children}
    </span>
  );
}

function icon(Component: LucideIcon, size: number) {
  return function Icon({ size: override }: IconProps): JSX.Element {
    return withDefaults(
      override ?? size,
      <Component size={override ?? size} strokeWidth={1.75} />,
    );
  };
}

export const FolderIcon = icon(Folder, 15);
export const FolderOpenIcon = icon(FolderOpen, 15);
export const SidebarIcon = icon(PanelLeft, 15);
export const ChevronIcon = icon(ChevronRight, 13);
export const MarkdownFileIcon = icon(FileText, 15);
export const PlainFileIcon = icon(File, 15);
export const CodeFileIcon = icon(FileCode, 15);
export const SettingsIcon = icon(Settings, 15);
export const SearchIcon = icon(Search, 15);
export const CloseIcon = icon(X, 13);
export const ChevronUpIcon = icon(ChevronUp, 13);
export const ChevronDownIcon = icon(ChevronDown, 13);
export const FilePlusIcon = icon(FilePlus, 15);
export const FolderPlusIcon = icon(FolderPlus, 15);
export const OutlineIcon = icon(ListTree, 15);
export const BacklinksIcon = icon(Link2, 15);
export const FocusIcon = icon(Focus, 15);
export const EyeIcon = icon(Eye, 15);
export const PenIcon = icon(Pen, 15);
export const SplitIcon = icon(Columns2, 15);
export const ResearchIcon = icon(Compass, 15);
