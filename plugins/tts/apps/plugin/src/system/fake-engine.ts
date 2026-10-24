import type { Engine, Reply } from "./script-process";

/** An Engine the test answers by hand, recording what was sent. */
export class FakeEngine implements Engine {
  readonly requests: { id: number; message: Record<string, unknown> }[] = [];
  readonly notified: Record<string, unknown>[] = [];
  readonly #listeners = new Map<number, (reply: Reply) => void>();
  #nextId = 1;

  request(
    message: Record<string, unknown>,
    listener: (reply: Reply) => void,
  ): number {
    const id = this.#nextId++;
    this.requests.push({ id, message });
    this.#listeners.set(id, listener);
    return id;
  }

  notify(message: Record<string, unknown>): void {
    this.notified.push(message);
  }

  release(id: number): void {
    this.#listeners.delete(id);
  }

  /** Answers request `id`, if it is still listened to. */
  reply(id: number, reply: Omit<Reply, "id">): void {
    this.#listeners.get(id)?.({ id, ...reply });
  }

  get listening(): number {
    return this.#listeners.size;
  }
}
