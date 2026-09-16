import { explainTwitchError } from "../twitch/errors";

import type { PredictionsApi } from "./api";
import { toCreatePredictionData, type PredictionDraft, type PredictionSource } from "./prediction";

const NO_BROADCASTER = "Connect the broadcaster account to run predictions.";
const NO_CURRENT = "no prediction is currently running";

/** Statuses Twitch has not yet closed out — the only ones a write may act on. */
const RUNNING_STATUSES = new Set(["ACTIVE", "LOCKED"]);

/**
 * Runs the Channel's Prediction through its whole lifecycle: start, lock,
 * resolve, cancel.
 *
 * Holds no state of its own, the same way `PollsService` does not (and for
 * the same reason): Twitch allows at most one running Prediction per Channel,
 * so "is one running, and which" is answered by asking Twitch fresh every
 * time. Nothing is cached, so a plugin restart has nothing to lose.
 */
export class PredictionsService {
  constructor(
    private readonly channelId: () => string | undefined,
    private readonly api: PredictionsApi,
  ) {}

  /** @returns the id of the Prediction that started, or nothing when it did not. */
  async start(draft: PredictionDraft): Promise<string | undefined> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return undefined;
    }

    const running = await this.current(channelId);

    if (running) {
      console.error(
        `Start Prediction did not start "${draft.title}": the prediction ` +
          `"${running.title}" is still running. Twitch allows only one at a time — ` +
          "resolve or cancel it before starting another.",
      );
      return undefined;
    }

    try {
      const created = await this.api.createPrediction(channelId, toCreatePredictionData(draft));
      console.log(`Started the prediction "${created.title}"`);
      return created.id;
    } catch (error) {
      console.error(
        `The prediction "${draft.title}" was not started: ${explainTwitchError(error)}`,
      );
      return undefined;
    }
  }

  /** Closes betting on whichever Prediction is running. */
  async lock(): Promise<void> {
    const title = await this.act("Lock Prediction", "locked", (channelId, id) =>
      this.api.lockPrediction(channelId, id),
    );

    if (title) {
      console.log(`Locked the prediction "${title}"`);
    }
  }

  /**
   * Resolves the running Prediction in favour of one Outcome, paying out
   * whoever bet on it.
   *
   * @param outcomeRef The Outcome's position (`"1"`, `"2"`, …) or its exact
   * title, however the Action's settings named it — never Twitch's id.
   */
  async resolve(outcomeRef: string): Promise<void> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return;
    }

    const running = await this.current(channelId);

    if (!running) {
      console.warn(`Resolve Prediction ran with ${NO_CURRENT}`);
      return;
    }

    const outcome = matchOutcome(running.outcomes, outcomeRef);

    if (!outcome) {
      const known = running.outcomes.map((o, i) => `${i + 1}. ${o.title}`).join(", ");
      console.error(
        `Resolve Prediction could not match "${outcomeRef}" to an outcome of ` +
          `"${running.title}". Its outcomes are: ${known}`,
      );
      return;
    }

    try {
      await this.api.resolvePrediction(channelId, running.id, outcome.id);
      console.log(`Resolved the prediction "${running.title}" in favour of "${outcome.title}"`);
    } catch (error) {
      console.error(
        `The prediction "${running.title}" was not resolved: ${explainTwitchError(error)}`,
      );
    }
  }

  /** Cancels the running Prediction, refunding every bet. */
  async cancel(): Promise<void> {
    const title = await this.act("Cancel Prediction", "canceled", (channelId, id) =>
      this.api.cancelPrediction(channelId, id),
    );

    if (title) {
      console.log(`Canceled the prediction "${title}"`);
    }
  }

  /**
   * The shape shared by Lock and Cancel: no broadcaster, or nothing running,
   * both explained in the log; otherwise the write runs and its own failure
   * is explained too.
   *
   * @param actionName How the Action is named, for the "nothing running" log
   * line — e.g. `"Lock Prediction"`.
   * @param pastTense How the write reads once done, for the failure line —
   * e.g. `"locked"`.
   * @returns the acted-on Prediction's title, so the caller can say what it
   * did, or nothing when the write did not happen.
   */
  private async act(
    actionName: string,
    pastTense: string,
    write: (channelId: string, id: string) => Promise<unknown>,
  ): Promise<string | undefined> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return undefined;
    }

    const running = await this.current(channelId);

    if (!running) {
      console.warn(`${actionName} ran with ${NO_CURRENT}`);
      return undefined;
    }

    try {
      await write(channelId, running.id);
      return running.title;
    } catch (error) {
      console.error(
        `The prediction "${running.title}" was not ${pastTense}: ${explainTwitchError(error)}`,
      );
      return undefined;
    }
  }

  /** The Channel's currently running Prediction — active or locked — if it has one. */
  private async current(channelId: string): Promise<PredictionSource | undefined> {
    try {
      const { data } = await this.api.getPredictions(channelId);
      return data.find((prediction) => RUNNING_STATUSES.has(prediction.status));
    } catch (error) {
      console.error(`The channel's predictions could not be read: ${explainTwitchError(error)}`);
      return undefined;
    }
  }
}

/**
 * The Outcome a `resolve()` call names, by position or by title.
 *
 * A number is tried first: a title that happens to read as a number (rare,
 * but not impossible) would otherwise be unreachable.
 */
function matchOutcome(
  outcomes: readonly { id: string; title: string }[],
  ref: string,
): { id: string; title: string } | undefined {
  const trimmed = ref.trim();
  const position = Number(trimmed);

  if (Number.isInteger(position) && position >= 1 && position <= outcomes.length) {
    return outcomes[position - 1];
  }

  return outcomes.find((outcome) => outcome.title.trim().toLowerCase() === trimmed.toLowerCase());
}
