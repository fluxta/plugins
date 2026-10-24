import type { Plugin } from "@fluxta/sdk/api";
import type { ElevenLabsStatus } from "tts-protocol";

import type { Outcome } from "./client";

/** What `setConnections` takes; the SDK does not name its type. */
type ExternalConnection = Parameters<Plugin["setConnections"]>[0][number];

/** The External Connection's id and title in the host's indicator. */
export const ELEVENLABS_CONNECTION = { id: "elevenlabs", title: "ElevenLabs" };

export type ElevenLabsAccountOptions = {
  /** The API key as stored now. */
  key: () => string | undefined;
  /** Called after every change of the status. */
  onChange?: () => void;
  /** Reports the External Connections — none, or ElevenLabs. */
  report: (connections: ExternalConnection[]) => void;
};

/**
 * The ElevenLabs account as the plugin last found it: whether a key is
 * stored, and what the latest call to ElevenLabs said of it. Shown in the
 * Plugin Editor and as the External Connection "ElevenLabs" in the host's
 * indicator — present only while a key is stored, and only once a call has
 * answered, so it never reads "not connected" before anything was tried.
 *
 * A display, not a gate: nothing is refused because the account looked
 * down, and nothing checks it on a timer. Every Phrase calls ElevenLabs
 * afresh, so a fixed account turns connected with the next call.
 */
export class ElevenLabsAccount {
  readonly #key: () => string | undefined;
  readonly #onChange: () => void;
  readonly #report: (connections: ExternalConnection[]) => void;
  #status: ElevenLabsStatus = { state: "no-key" };
  /** What the indicator shows; `undefined` until a call has answered. */
  #connected?: boolean;
  /** The External Connections last reported, as JSON. */
  #reported = "[]";

  constructor({ key, onChange = () => {}, report }: ElevenLabsAccountOptions) {
    this.#key = key;
    this.#onChange = onChange;
    this.#report = report;
  }

  get status(): ElevenLabsStatus {
    return this.#status;
  }

  /**
   * The key was loaded, stored or removed: with one, the account is being
   * checked until a call answers. The indicator keeps what it showed — a
   * replaced key is likely as good as the one before — until then.
   */
  keyChanged(): void {
    if (this.#key() === undefined) {
      this.#connected = undefined;
      this.#set({ state: "no-key" });
    } else {
      this.#set({ state: "checking" });
    }
  }

  /** What a call made with `key` said of the account. */
  outcome(outcome: Outcome, key: string): void {
    // A call made with a key since replaced or removed says nothing of the
    // account as it is now.
    if (outcome === undefined || key !== this.#key()) {
      return;
    }
    this.#connected = outcome.connected;
    this.#set(
      outcome.connected
        ? { state: "connected" }
        : { state: "not-connected", reason: outcome.reason },
    );
  }

  /**
   * Takes a status, and tells only of a change: the editors look the voices
   * up again when told, and a list that failed is asked for afresh — told of
   * every call, they would call again and again.
   */
  #set(status: ElevenLabsStatus): void {
    const connections =
      this.#connected === undefined
        ? []
        : [{ ...ELEVENLABS_CONNECTION, connected: this.#connected }];
    const reported = JSON.stringify(connections);
    if (reported !== this.#reported) {
      this.#reported = reported;
      this.#report(connections);
    }
    if (JSON.stringify(status) !== JSON.stringify(this.#status)) {
      this.#status = status;
      this.#onChange();
    }
  }
}
