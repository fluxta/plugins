/**
 * A list looked up once and kept: asking the OS takes tens of milliseconds,
 * which whatever reads it often would otherwise wait for. An editor opening
 * asks afresh, so whatever was installed or plugged in meanwhile shows up
 * there.
 */
export class Listing<T> {
  readonly #lookUp: () => Promise<T[]>;
  #list?: Promise<T[]>;

  constructor(lookUp: () => Promise<T[]>) {
    this.#lookUp = lookUp;
  }

  /** The list as last looked up, or looked up now. */
  list(): Promise<T[]> {
    return this.#list ?? this.refresh();
  }

  /** The list looked up afresh. A failed look-up is not kept. */
  refresh(): Promise<T[]> {
    const list = this.#lookUp();
    this.#list = list;
    list.catch(() => {
      if (this.#list === list) {
        this.#list = undefined;
      }
    });
    return list;
  }
}
