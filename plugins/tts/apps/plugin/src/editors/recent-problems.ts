import { RECENT_PROBLEMS_KEPT, type RecentProblem } from "tts-protocol";

import type { Drop } from "../speech/speech-queue";

/**
 * The Phrases dropped since the plugin started, newest first, for the Plugin
 * Editor: the run that spoke a Phrase returned long ago, and a plugin cannot
 * fail it (fluxta/hub#16). Held in memory, as the Speech Queue is — a restart
 * clears it.
 */
export class RecentProblems {
  readonly #onChange: () => void;
  readonly #now: () => number;
  #problems: RecentProblem[] = [];
  #nextId = 1;

  constructor(onChange: () => void, now: () => number = Date.now) {
    this.#onChange = onChange;
    this.#now = now;
  }

  get list(): RecentProblem[] {
    return this.#problems;
  }

  add(drop: Drop): void {
    this.#problems = [
      { id: this.#nextId++, at: this.#now(), ...drop },
      ...this.#problems,
    ].slice(0, RECENT_PROBLEMS_KEPT);
    this.#onChange();
  }
}
