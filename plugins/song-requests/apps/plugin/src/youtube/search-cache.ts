/** Only the words and the chosen id are kept; Playability and Rules are checked afresh. */
export type SearchCacheEntry = {
  words: string;
  videoId: string;
  foundAt: number;
};

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function searchWords(request: string): string {
  return request.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The 7-day search cache from ADR-0005, kept in the State file (ADR-0002). */
export class SearchCache {
  readonly #entries = new Map<string, SearchCacheEntry>();
  readonly #onChange?: () => void;

  constructor({
    initial = [],
    onChange,
  }: {
    initial?: SearchCacheEntry[];
    onChange?: () => void;
  } = {}) {
    for (const entry of initial) {
      if (Date.now() - entry.foundAt < MAX_AGE_MS) {
        this.#entries.set(searchWords(entry.words), entry);
      }
    }
    this.#onChange = onChange;
  }

  get(words: string): string | undefined {
    this.#prune();
    return this.#entries.get(searchWords(words))?.videoId;
  }

  set(words: string, videoId: string): void {
    words = searchWords(words);
    this.#entries.set(words, { words, videoId, foundAt: Date.now() });
    this.#onChange?.();
  }

  snapshot(): SearchCacheEntry[] {
    this.#prune();
    return [...this.#entries.values()];
  }

  #prune(): void {
    for (const [words, entry] of this.#entries) {
      if (Date.now() - entry.foundAt >= MAX_AGE_MS) this.#entries.delete(words);
    }
  }
}
