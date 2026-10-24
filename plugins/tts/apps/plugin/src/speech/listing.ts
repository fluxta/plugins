/**
 * A list looked up once and kept: asking the OS takes tens of milliseconds,
 * which whatever reads it often would otherwise wait for. An editor opening
 * asks afresh, so whatever was installed or plugged in meanwhile shows up
 * there.
 */
export class Listing<T> {
  readonly #lookUp: () => Promise<T[]>;
  #list?: Promise<T[]>;
  #latest?: Promise<T[]>;
  #settled?: Settled<T>;

  constructor(lookUp: () => Promise<T[]>) {
    this.#lookUp = lookUp;
  }

  /** The list as last looked up, or looked up now. */
  list(): Promise<T[]> {
    return this.#list ?? this.refresh();
  }

  /**
   * How the latest look-up to have settled went — its list, or why there is
   * none — for an editor to show without waiting for one under way.
   * `undefined` until one has settled.
   */
  get settled(): Settled<T> | undefined {
    return this.#settled;
  }

  /** The list looked up afresh. A failed look-up is not kept. */
  refresh(): Promise<T[]> {
    const list = this.#lookUp();
    this.#list = list;
    this.#latest = list;
    list.then(
      (items) => {
        if (this.#latest === list) {
          this.#settled = { list: items };
        }
      },
      (error: unknown) => {
        if (this.#list === list) {
          this.#list = undefined;
        }
        if (this.#latest === list) {
          this.#settled = {
            list: [],
            problem: error instanceof Error ? error.message : String(error),
          };
        }
      },
    );
    return list;
  }
}

/** A look-up as it settled: its list, or — empty — why there is none. */
export type Settled<T> = { list: T[]; problem?: string };
