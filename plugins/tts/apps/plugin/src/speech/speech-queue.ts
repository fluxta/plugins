import { PlayerError, type OutputDevice, type Player } from "./player";
import { ProviderError, type Provider } from "./provider";

/** One Speak's text as accepted into the Speech Queue. */
export type Phrase = {
  /** What it says, after interpolation. */
  text: string;
  /**
   * What Stop Speech can address it by, compared exactly. Never empty
   * strings: a Tag nothing can address is discarded before it gets here.
   */
  tags: readonly string[];
  /** A Voice's id, or absent for the one `voiceFor` picks. */
  voice?: string;
  /** A multiplier, 1 being the voice's normal pace. */
  rate: number;
  /** 0–1, the Player's. */
  volume: number;
  device: OutputDevice;
  /**
   * Present on a Listen's Phrase: the id the editor that asked gave it.
   * Spoken like any other, but out of a scenario's sight — see
   * {@link SpeechQueue}.
   */
  listen?: string;
};

/**
 * Where a Phrase goes: **In turn** to the end of the queue, **Next** ahead of
 * every In turn Phrase but behind the other Next ones, **Now** in place of
 * the current Phrase, which it cuts off.
 */
export type Position = "in-turn" | "next" | "now";

export type SpeechQueueOptions = {
  provider: Provider;
  player: Player;
  /** The id of the Voice a Phrase is spoken with. */
  voiceFor: (phrase: Phrase) => Promise<string>;
  /** A Phrase that could not be spoken, and why. The queue moves on. */
  onDropped: (phrase: Phrase, error: unknown) => void;
  /** A Phrase's sound has started. Never called for a Listen. */
  onStarted: (phrase: Phrase) => void;
  /**
   * A Phrase that started has ended, however it ended — spoken to the end,
   * cut off by Stop Speech or a Now, or by the Player failing. Called exactly
   * once for every `onStarted`, so whatever a scenario shows on Phrase
   * Started is never left stuck. Never called for a Listen.
   */
  onFinished: (phrase: Phrase) => void;
};

/** The Phrase being handled: synthesized, then played. */
type Current = {
  phrase: Phrase;
  abort: AbortController;
  /** Once its Phrase Finished, if any, has gone out. Never rejects. */
  settled: Promise<void>;
};

/**
 * The plugin's single Speech Queue: Phrases are spoken strictly one at a
 * time, in the order their Position gives them, whatever started them.
 *
 * The queue owns the order, not the host. Speak only enqueues and returns,
 * so the 30-second action timeout never cuts a Phrase short, and a burst of
 * chat messages from an Event whose runs execute in parallel still waits its
 * turn. Urgency lives here for the same reason: a Now takes the current
 * Phrase's place within the Speak that asked for it — "skip, then Speak" as
 * two Actions would let the queue start its next Phrase in between. It lives
 * in memory: a restart loses whatever was waiting.
 *
 * A Listen's Phrase waits its turn like a Next one, so it never talks over a
 * viewer, and Stop Speech reaches it as it reaches any Phrase. Scenarios do
 * not see it otherwise: it is not counted by `speaking` or `waiting`, and it
 * starts and finishes without `onStarted` or `onFinished`.
 */
export class SpeechQueue {
  readonly #options: SpeechQueueOptions;
  /** Next Phrases, in the order they arrived. */
  #ahead: Phrase[] = [];
  /** In turn Phrases, in the order they arrived. */
  #inTurn: Phrase[] = [];
  #current?: Current;

  constructor(options: SpeechQueueOptions) {
    this.#options = options;
  }

  /** Accepts a Phrase where its Position puts it, without waiting for it. */
  enqueue(phrase: Phrase, position: Position = "in-turn"): void {
    if (position === "now") {
      const cutOff = this.#current;
      cutOff?.abort.abort();
      this.#start(phrase, cutOff?.settled);
      return;
    }
    (position === "next" ? this.#ahead : this.#inTurn).push(phrase);
    this.#advance();
  }

  /** Cuts off the current Phrase; the queue goes on with the next one. */
  stopCurrent(): void {
    this.#current?.abort.abort();
  }

  /** Cuts off the current Phrase and empties the queue, Next included. */
  stopEverything(): void {
    this.#ahead = [];
    this.#inTurn = [];
    this.#current?.abort.abort();
  }

  /**
   * Takes every waiting Phrase carrying `tag` out of the queue, and cuts off
   * the current one if it carries it too.
   */
  stopTagged(tag: string): void {
    const untagged = (phrase: Phrase) => !phrase.tags.includes(tag);
    this.#ahead = this.#ahead.filter(untagged);
    this.#inTurn = this.#inTurn.filter(untagged);
    if (this.#current && !untagged(this.#current.phrase)) {
      this.#current.abort.abort();
    }
  }

  /** How many Phrases wait — the one being spoken and Listens not counted. */
  get waiting(): number {
    return [...this.#ahead, ...this.#inTurn].filter(seen).length;
  }

  /**
   * Whether a Phrase other than a Listen is being handled, from the moment it
   * leaves the queue — its synthesis included — until it ends.
   */
  get speaking(): boolean {
    return this.#current !== undefined && seen(this.#current.phrase);
  }

  #advance(): void {
    if (this.#current) {
      return;
    }
    const phrase = this.#ahead.shift() ?? this.#inTurn.shift();
    if (phrase) {
      this.#start(phrase);
    }
  }

  /**
   * Makes `phrase` the current Phrase at once. A Now passes the Phrase it cut
   * off as `after`: it is spoken only once that one has ended, so the Phrase
   * Finished of the one goes out before the Phrase Started of the other.
   */
  #start(phrase: Phrase, after?: Promise<void>): void {
    const abort = new AbortController();
    const current: Current = {
      phrase,
      abort,
      settled: this.#speak(phrase, abort.signal, after),
    };
    this.#current = current;
    void current.settled.then(() => {
      // A Now that took its place is the current Phrase already.
      if (this.#current === current) {
        this.#current = undefined;
        this.#advance();
      }
    });
  }

  /**
   * Speaks `phrase`, trying once more after a `transient` failure — a
   * crashed engine starts afresh — but only while no sound has started: a
   * Phrase cut off mid-sound is not heard twice. A second failure drops it.
   */
  async #speak(
    phrase: Phrase,
    signal: AbortSignal,
    after?: Promise<void>,
  ): Promise<void> {
    const { onDropped, onFinished } = this.#options;
    const sound = { started: false };
    try {
      await after;
      try {
        await this.#attempt(phrase, signal, sound);
      } catch (error) {
        if (signal.aborted || sound.started || !isTransient(error)) {
          throw error;
        }
        await this.#attempt(phrase, signal, sound);
      }
    } catch (error) {
      // A stopped Phrase was not dropped: someone asked for it.
      if (!signal.aborted) {
        notify(() => onDropped(phrase, error));
      }
    } finally {
      if (sound.started && seen(phrase)) {
        notify(() => onFinished(phrase));
      }
    }
  }

  /** One try at `phrase`: its Voice, its synthesis, its play. */
  async #attempt(
    phrase: Phrase,
    signal: AbortSignal,
    sound: { started: boolean },
  ): Promise<void> {
    const { provider, player, voiceFor, onStarted } = this.#options;
    signal.throwIfAborted();
    const voice = await voiceFor(phrase);
    signal.throwIfAborted();
    const audio = await provider.synthesize(
      phrase.text,
      voice,
      { rate: phrase.rate },
      signal,
    );
    let over = false;
    try {
      await player.play(
        audio,
        {
          volume: phrase.volume,
          device: phrase.device,
          // Once, and never after this play has settled — whatever the
          // Player does, a Phrase starts at most once.
          onStarted: () => {
            if (sound.started || over) {
              return;
            }
            sound.started = true;
            if (seen(phrase)) {
              notify(() => onStarted(phrase));
            }
          },
        },
        signal,
      );
    } finally {
      over = true;
    }
  }
}

/** Whether scenarios see the Phrase: every one but a Listen's. */
function seen(phrase: Phrase): boolean {
  return phrase.listen === undefined;
}

/** A failure that trying again may get past. */
function isTransient(error: unknown): boolean {
  return (
    (error instanceof ProviderError || error instanceof PlayerError) &&
    error.kind === "transient"
  );
}

/**
 * Runs a listener without letting it break the queue: a Player calls back
 * from wherever its sound is reported, and the queue must go on whatever a
 * listener does.
 */
function notify(listener: () => void): void {
  try {
    listener();
  } catch (error) {
    console.error("A Speech Queue listener failed:", error);
  }
}

/** How much of a dropped Phrase's text is told. */
const TEXT_SHOWN = 40;

/**
 * A dropped Phrase as it is told — in the log and in Recent problems: why,
 * and the beginning of its text, enough to find the viewer's message that
 * was lost.
 */
export type Drop = {
  /** The Provider's or the Player's error kind: `voice-missing`, `rejected`… */
  kind: string;
  /** What a person reads: `No voice … on this computer`. */
  reason: string;
  /** The beginning of the text, `…` where it is cut. */
  text: string;
};

export function dropOf(phrase: Phrase, error: unknown): Drop {
  const known = error instanceof ProviderError || error instanceof PlayerError;
  const graphemes = Array.from(
    new Intl.Segmenter().segment(phrase.text),
    ({ segment }) => segment,
  );
  return {
    kind: known ? error.kind : "unavailable",
    reason: error instanceof Error ? error.message : String(error),
    text:
      graphemes.length > TEXT_SHOWN
        ? `${graphemes.slice(0, TEXT_SHOWN).join("")}…`
        : phrase.text,
  };
}

/** The log line of a dropped Phrase. */
export function describeDrop({ kind, reason, text }: Drop): string {
  return `Phrase dropped: ${kind} — ${reason}: "${text}"`;
}
