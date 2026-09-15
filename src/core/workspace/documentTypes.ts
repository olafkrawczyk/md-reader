/**
 * Maps workspace files to document types. Extensions claim types (e.g. by
 * file extension); a file no extension claims opens as plain text.
 */
export interface DocumentType {
  readonly id: string;
  readonly mimeType: string;
}

export interface DocumentTypeClaim {
  readonly type: DocumentType;
  readonly extensions: ReadonlySet<string>;
}

export const PLAIN_TEXT_TYPE: DocumentType = {
  id: "text",
  mimeType: "text/plain",
};

const PLAIN_TEXT_EXTENSIONS: ReadonlySet<string> = new Set(["txt", "text"]);

export class DocumentTypeRegistry {
  readonly #claims: DocumentTypeClaim[] = [];

  /**
   * Claims a document type. `extensions` are file extensions without a
   * leading dot (e.g. `["md", "markdown"]`), matched case-insensitively.
   */
  register(type: DocumentType, extensions: readonly string[]): void {
    this.#claims.push({
      type,
      extensions: new Set(extensions.map((ext) => ext.toLowerCase())),
    });
  }

  /** The claim matching the path's extension, if any. */
  claimForPath(path: string): DocumentTypeClaim | null {
    const dot = path.lastIndexOf(".");
    if (dot === -1) {
      return null;
    }
    const ext = path.slice(dot + 1).toLowerCase();
    for (const claim of this.#claims) {
      if (claim.extensions.has(ext)) {
        return claim;
      }
    }
    return null;
  }

  /**
   * Extensions the explorer displays: claimed document-type extensions plus
   * plain text (which opens without a claim). The single definition shared
   * by the display filter and name normalization.
   */
  isDisplayableExtension(ext: string): boolean {
    const normalized = ext.toLowerCase();
    return (
      this.claimForPath(`name.${normalized}`) !== null ||
      PLAIN_TEXT_EXTENSIONS.has(normalized)
    );
  }

  typeForPath(path: string): DocumentType {
    return this.claimForPath(path)?.type ?? PLAIN_TEXT_TYPE;
  }
}
