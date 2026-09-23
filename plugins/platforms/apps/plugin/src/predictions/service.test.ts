import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PredictionsApi } from "./api";
import type { PredictionDraft, PredictionSource } from "./prediction";
import { PredictionsService } from "./service";

const CHANNEL = "channel-1";

function prediction(overrides: Partial<PredictionSource> = {}): PredictionSource {
  return {
    id: "prediction-1",
    title: "Do we win?",
    status: "ACTIVE",
    outcomes: [
      { id: "outcome-yes", title: "Yes" },
      { id: "outcome-no", title: "No" },
    ],
    ...overrides,
  };
}

function draft(overrides: Partial<PredictionDraft> = {}): PredictionDraft {
  return { title: "Do we win?", outcomes: ["Yes", "No"], duration: 120, ...overrides };
}

/** Twitch, as far as this service can tell. */
class FakePredictions implements PredictionsApi {
  predictions: PredictionSource[] = [];
  created: { title: string; outcomes: string[]; autoLockAfter: number }[] = [];
  locked: string[] = [];
  resolved: { id: string; outcomeId: string }[] = [];
  canceled: string[] = [];
  /** Thrown by the next write, to stand in for a refusal. */
  refuse?: Error;

  getPredictions(broadcaster: string) {
    expect(broadcaster).toBe(CHANNEL);
    return Promise.resolve({ data: this.predictions });
  }

  createPrediction(
    _broadcaster: string,
    data: { title: string; outcomes: string[]; autoLockAfter: number },
  ) {
    this.refused();
    this.created.push(data);

    const created = prediction({
      id: `prediction-${this.predictions.length + 1}`,
      title: data.title,
      outcomes: data.outcomes.map((title, i) => ({ id: `outcome-${i + 1}`, title })),
    });

    this.predictions.push(created);
    return Promise.resolve(created);
  }

  lockPrediction(_broadcaster: string, id: string) {
    this.refused();
    this.locked.push(id);
    return Promise.resolve(this.transition(id, "LOCKED"));
  }

  resolvePrediction(_broadcaster: string, id: string, outcomeId: string) {
    this.refused();
    this.resolved.push({ id, outcomeId });
    return Promise.resolve(this.transition(id, "RESOLVED"));
  }

  cancelPrediction(_broadcaster: string, id: string) {
    this.refused();
    this.canceled.push(id);
    return Promise.resolve(this.transition(id, "CANCELED"));
  }

  private transition(id: string, status: string): PredictionSource {
    const found = this.predictions.find((existing) => existing.id === id);
    this.predictions = this.predictions.map((existing) =>
      existing.id === id ? { ...existing, status } : existing,
    );
    return found ? { ...found, status } : prediction({ id, status });
  }

  private refused(): void {
    if (this.refuse) {
      throw this.refuse;
    }
  }
}

describe("PredictionsService", () => {
  let api: FakePredictions;
  let channelId: string | undefined;
  let service: PredictionsService;
  let errors: string[];
  let logs: string[];

  beforeEach(() => {
    api = new FakePredictions();
    channelId = CHANNEL;
    service = new PredictionsService(() => channelId, api);

    // The log is where an Action reports itself, so it is part of what these
    // tests are checking rather than noise to be hidden.
    errors = [];
    logs = [];
    vi.spyOn(console, "error").mockImplementation((...args) => void errors.push(String(args[0])));
    vi.spyOn(console, "warn").mockImplementation((...args) => void errors.push(String(args[0])));
    vi.spyOn(console, "log").mockImplementation((...args) => void logs.push(String(args[0])));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("starting a prediction", () => {
    it("creates it on twitch and returns its id", async () => {
      const id = await service.start(draft());

      expect(id).toBe("prediction-1");
      expect(api.created).toEqual([
        { title: "Do we win?", outcomes: ["Yes", "No"], autoLockAfter: 120 },
      ]);
    });

    it("refuses a second prediction while one is running, in the plugin's own words", async () => {
      api.predictions = [prediction({ id: "prediction-1", title: "First prediction" })];

      const id = await service.start(draft({ title: "Second prediction" }));

      expect(id).toBeUndefined();
      expect(api.created).toEqual([]);
      expect(errors.join("\n")).toContain("First prediction");
      expect(errors.join("\n")).toContain("still running");
    });

    it("treats a locked prediction as still running", async () => {
      api.predictions = [prediction({ id: "prediction-1", status: "LOCKED" })];

      const id = await service.start(draft());

      expect(id).toBeUndefined();
      expect(errors.join("\n")).toContain("still running");
    });

    it("does not confuse a resolved or canceled prediction with one still running", async () => {
      api.predictions = [prediction({ id: "prediction-1", status: "RESOLVED" })];

      const id = await service.start(draft({ title: "New prediction" }));

      expect(id).toBe("prediction-2");
    });

    it("refuses with no broadcaster account, and says which to connect", async () => {
      channelId = undefined;

      const id = await service.start(draft());

      expect(id).toBeUndefined();
      expect(errors.join("\n")).toContain("broadcaster account");
    });

    it("reports what twitch refused, in words the log can show", async () => {
      api.refuse = Object.assign(new Error("nope"), {
        statusCode: 400,
        body: '{"message":"prediction_window must be between 30 and 1800"}',
      });

      const id = await service.start(draft());

      expect(id).toBeUndefined();
      expect(errors.join("\n")).toContain("prediction_window must be between 30 and 1800");
    });
  });

  describe("locking a prediction", () => {
    it("locks whichever prediction is running", async () => {
      api.predictions = [prediction({ id: "prediction-1", title: "Do we win?" })];

      await service.lock();

      expect(api.locked).toEqual(["prediction-1"]);
      expect(logs.join("\n")).toContain("Do we win?");
    });

    it("does nothing, loudly, when no prediction is running", async () => {
      await service.lock();

      expect(api.locked).toEqual([]);
      expect(errors.join("\n")).toContain("no prediction is currently running");
    });

    it("does not throw with no prediction running, so the run does not fail", async () => {
      await expect(service.lock()).resolves.toBeUndefined();
    });
  });

  describe("resolving a prediction", () => {
    beforeEach(() => {
      api.predictions = [prediction({ id: "prediction-1", title: "Do we win?" })];
    });

    it("resolves in favour of the outcome named by its number", async () => {
      await service.resolve("2");

      expect(api.resolved).toEqual([{ id: "prediction-1", outcomeId: "outcome-no" }]);
    });

    it("resolves in favour of the outcome named by its title, case-insensitively", async () => {
      await service.resolve(" yes ");

      expect(api.resolved).toEqual([{ id: "prediction-1", outcomeId: "outcome-yes" }]);
    });

    it("says what it did, naming the outcome rather than its id", async () => {
      await service.resolve("1");

      expect(logs.join("\n")).toContain("Yes");
    });

    it("explains an outcome that matches nothing, listing what does", async () => {
      await service.resolve("Maybe");

      expect(api.resolved).toEqual([]);
      expect(errors.join("\n")).toContain("Maybe");
      expect(errors.join("\n")).toContain("1. Yes");
      expect(errors.join("\n")).toContain("2. No");
    });

    it("explains a position outside the outcome count", async () => {
      await service.resolve("5");

      expect(api.resolved).toEqual([]);
      expect(errors.join("\n")).toContain("could not match");
    });

    it("does nothing, loudly, when no prediction is running", async () => {
      api.predictions = [];

      await service.resolve("1");

      expect(api.resolved).toEqual([]);
      expect(errors.join("\n")).toContain("no prediction is currently running");
    });

    it("does not throw on a resolve that matches nothing, so the run does not fail", async () => {
      await expect(service.resolve("Maybe")).resolves.toBeUndefined();
    });
  });

  describe("canceling a prediction", () => {
    it("cancels whichever prediction is running", async () => {
      api.predictions = [prediction({ id: "prediction-1", title: "Do we win?" })];

      await service.cancel();

      expect(api.canceled).toEqual(["prediction-1"]);
      expect(logs.join("\n")).toContain("Do we win?");
    });

    it("does nothing, loudly, when no prediction is running", async () => {
      await service.cancel();

      expect(api.canceled).toEqual([]);
      expect(errors.join("\n")).toContain("no prediction is currently running");
    });
  });
});
