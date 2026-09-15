## 1. Registry and helper

- [x] 1.1 Add `isDisplayableExtension(ext)` to `DocumentTypeRegistry` (claimed extensions plus plain-text `txt`/`text`), and switch `sidebar.tsx`'s `isDisplayableFile` to use it (drop the local `TEXT_EXTENSIONS` set)
- [x] 1.2 Add pure `normalizeDocumentName(name, isSupportedExtension)` to `explorerActions.ts`; add `isFolder` to `ExplorerRenameState` and set it in `runMenuAction`

## 2. Controller wiring

- [x] 2.1 In `fileManagement.tsx`, build the supported-extension predicate from `#workspace.documentTypes.isDisplayableExtension`; apply `normalizeDocumentName` in `confirmInline` when `inline.mode === "file"` and in `confirmRename` when the rename target is a file

## 3. Create-field prefill

- [x] 3.1 In `sidebar.tsx`, pass `initial: "Untitled.md"` with stem selection (`selectUpTo`) to the inline create field for file mode (action bar and context-menu paths, root and nested); folder creation keeps the empty field

## 4. Verification

- [x] 4.1 Automated (`tests/file-naming.mjs`, Playwright over the real UI): create without extension → `.md`; `notes.txt` kept; `notes.cpp` → `notes.cpp.md`; `note.` → `note.md`; prefill `Untitled.md` with stem selected; rename dropping the extension re-appends; folders untouched
- [x] 4.2 Lint, typecheck, existing suites (ticks, reading, safety), build all pass
