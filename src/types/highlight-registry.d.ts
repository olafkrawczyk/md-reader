/*
 * lib.dom types HighlightRegistry with Set semantics, but the shipped spec
 * (and every browser engine) uses named entries with Map semantics.
 */
interface HighlightRegistry {
  set(name: string, highlight: Highlight): HighlightRegistry;
  get(name: string): Highlight | undefined;
}
