import {
  emptySnapshot,
  type ActionResult,
  type ConnectionChange,
  type LevelState,
  type MuteChange,
  type Snapshot,
  type Target,
  type VolumeChange,
} from "wave-link-protocol";
import { z } from "zod";

import { discoverPorts } from "./discovery";
import { connectRpc, type Rpc } from "./rpc";
import { MixerState } from "./state";

type Callbacks = {
  changed: (snapshot: Snapshot) => void;
  volumeChanged: (change: VolumeChange) => void;
  muteChanged: (change: MuteChange) => void;
  connectionChanged: (change: ConnectionChange) => void;
};
type IO = {
  ports: () => Promise<number[]>;
  connect: typeof connectRpc;
  schedule: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  cancel: (timer: ReturnType<typeof setTimeout>) => void;
};
const application = z.object({
  appID: z.literal("EWL"),
  interfaceRevision: z.number().int().min(1),
});
const errorText = (error: unknown): string =>
  error instanceof z.ZodError
    ? "Wave Link returned unsupported data. Check the tested versions in the plugin documentation."
    : error instanceof Error
      ? error.message
      : String(error);

export class WaveLinkService {
  readonly state: MixerState;
  private status = emptySnapshot();
  private rpc?: Rpc;
  private epoch = 0;
  private stopped = true;
  private abort?: AbortController;
  private retry?: ReturnType<typeof setTimeout>;
  private poll?: ReturnType<typeof setTimeout>;
  private backoff = 500;
  private tail: Promise<unknown> = Promise.resolve();
  private refreshing?: Promise<void>;
  private readonly io: IO;

  constructor(
    private readonly callbacks: Callbacks,
    io: Partial<IO> = {},
  ) {
    this.io = {
      ports: discoverPorts,
      connect: connectRpc,
      schedule: setTimeout,
      cancel: clearTimeout,
      ...io,
    };
    this.state = new MixerState(callbacks.volumeChanged, callbacks.muteChanged);
  }

  snapshot(): Snapshot {
    return {
      ...this.status,
      channels: structuredClone(this.state.channels),
      mixes: structuredClone(this.state.mixes),
    };
  }

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    await this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.epoch++;
    this.abort?.abort();
    if (this.retry) this.io.cancel(this.retry);
    if (this.poll) this.io.cancel(this.poll);
    const rpc = this.rpc;
    this.rpc = undefined;
    rpc?.close();
    this.state.clear();
  }

  read(target: Target): LevelState | null {
    if (!this.rpc?.connected || !this.state.ready) return null;
    try {
      return this.state.target(target);
    } catch {
      return null;
    }
  }

  setVolume(
    target: Target,
    number: number,
    relative: boolean,
  ): Promise<ActionResult> {
    return this.mutate(target, (current) => {
      if (!Number.isFinite(number))
        throw new Error("Volume must be a finite number.");
      if (current.volumePercent === null)
        throw new Error("Wave Link does not expose volume for this Target.");
      return {
        level:
          Math.min(
            100,
            Math.max(0, relative ? current.volumePercent + number : number),
          ) / 100,
      };
    });
  }

  setMute(
    target: Target,
    mode: "mute" | "unmute" | "toggle",
  ): Promise<ActionResult> {
    return this.mutate(target, (current) => {
      if (current.muted === null)
        throw new Error("Wave Link does not expose mute for this Target.");
      return { isMuted: mode === "toggle" ? !current.muted : mode === "mute" };
    });
  }

  failure(error: unknown): ActionResult {
    const message = errorText(error);
    this.status.lastError = message;
    this.publish();
    return { success: false, error: message };
  }

  private mutate(
    target: Target,
    patchFor: (current: LevelState) => { level?: number; isMuted?: boolean },
  ): Promise<ActionResult> {
    if (!this.rpc?.connected || !this.state.ready)
      return Promise.resolve(
        this.failure("Wave Link is not connected. The command was not queued."),
      );
    const epoch = this.epoch;
    const rpc = this.rpc;
    const command = this.tail
      .then(async () => {
        const assertCurrent = () => {
          if (
            epoch !== this.epoch ||
            this.rpc !== rpc ||
            !rpc.connected ||
            !this.state.ready
          ) {
            throw new Error(
              "The connection changed. The command was not replayed.",
            );
          }
        };
        assertCurrent();
        // Refresh within the mutation queue: two rapid +5 presses must read
        // successive confirmed states, not both write the same cached +5.
        await this.readTargetList(rpc, target, epoch);
        assertCurrent();
        const current = this.state.target(target);
        const patch = patchFor(current);
        const same =
          (patch.level === undefined ||
            Math.abs((current.volumePercent ?? -1) - patch.level * 100) <
              0.000001) &&
          (patch.isMuted === undefined || current.muted === patch.isMuted);
        if (!same) {
          const request = this.state.update(target, patch);
          await rpc.request(request.method, request.params);
          assertCurrent();
          await this.readTargetList(rpc, target, epoch);
          assertCurrent();
          const actual = this.state.target(target);
          if (
            (patch.level !== undefined &&
              (actual.volumePercent === null ||
                Math.abs(actual.volumePercent - patch.level * 100) > 0.01)) ||
            (patch.isMuted !== undefined && actual.muted !== patch.isMuted)
          ) {
            throw new Error(
              "Wave Link did not confirm the requested value. The command was not retried.",
            );
          }
        }
        this.status.lastError = "";
        this.publish();
        return { success: true, error: "" };
      })
      .catch((error: unknown) => this.failure(error));
    this.tail = command;
    return command;
  }

  private async readTargetList(
    rpc: Rpc,
    target: Target,
    epoch: number,
  ): Promise<void> {
    const isMix = target.targetKind === "mix";
    try {
      await rpc.request(isMix ? "getMixes" : "getChannels", {}, (value) => {
        if (epoch !== this.epoch) return;
        if (isMix) this.state.replaceMixes(value);
        else this.state.replaceChannels(value);
        this.publish();
      });
    } catch (error) {
      // A rejected read cannot establish current state. Drop the old values
      // immediately instead of leaving them visible until the next poll.
      if (epoch === this.epoch && this.rpc === rpc) this.lost(errorText(error));
      throw error;
    }
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const epoch = ++this.epoch;
    this.abort = new AbortController();
    let reason =
      "Wave Link 3 was not found. Start Wave Link; this plugin will reconnect automatically.";
    try {
      for (const port of await this.io.ports()) {
        if (this.stopped || epoch !== this.epoch) return;
        let candidate: Rpc | undefined;
        try {
          candidate = await this.io.connect(
            port,
            (method, value) => {
              if (epoch === this.epoch && !this.stopped)
                this.notification(method, value);
            },
            (message) => {
              if (candidate && this.rpc === candidate) this.lost(message);
            },
            this.abort.signal,
          );
          const info = application.parse(
            await candidate.request("getApplicationInfo"),
          );
          if (epoch !== this.epoch || this.stopped) {
            candidate.close();
            return;
          }
          this.state.clear();
          await Promise.all([
            candidate.request("getChannels", {}, (value) => {
              if (epoch === this.epoch) this.state.replaceChannels(value);
            }),
            candidate.request("getMixes", {}, (value) => {
              if (epoch === this.epoch) this.state.replaceMixes(value);
            }),
          ]);
          if (epoch !== this.epoch || this.stopped) {
            candidate.close();
            return;
          }
          if (!candidate.connected)
            throw new Error("Wave Link disconnected during initialization.");
          this.rpc = candidate;
          this.state.ready = true;
          this.status.interfaceRevision = info.interfaceRevision;
          this.backoff = 500;
          this.setStatus("connected", "Connected to local Wave Link 3.");
          this.schedulePoll();
          return;
        } catch (error) {
          candidate?.close();
          if (epoch !== this.epoch || this.stopped) return;
          this.state.clear();
          const message = errorText(error);
          if (
            !/ECONNREFUSED|closed the connection|disconnected|opening handshake/i.test(
              message,
            )
          )
            reason = message;
        }
      }
    } catch (error) {
      reason = errorText(error);
    }
    if (this.stopped || epoch !== this.epoch) return;
    this.status.interfaceRevision = null;
    this.setStatus("error", reason);
    this.scheduleRetry();
  }

  private notification(method: string, value: unknown): void {
    let known = true;
    switch (method) {
      case "channelsChanged":
        this.state.replaceChannels(value);
        break;
      case "mixesChanged":
        this.state.replaceMixes(value);
        break;
      case "channelChanged":
        if (!this.state.patchChannel(value) && this.state.ready)
          void this.refresh().catch(() => undefined);
        break;
      case "mixChanged":
        if (!this.state.patchMix(value) && this.state.ready)
          void this.refresh().catch(() => undefined);
        break;
      default:
        known = false;
    }
    if (known && this.state.ready) this.publish();
  }

  private refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const rpc = this.rpc;
    const epoch = this.epoch;
    if (!rpc) return Promise.resolve();
    // Keep background snapshots outside each command's read/write/read
    // sequence so a delayed poll cannot replace its confirmed state.
    const task = this.tail
      .then(async () => {
        if (
          epoch !== this.epoch ||
          this.rpc !== rpc ||
          !rpc.connected ||
          !this.state.ready
        )
          return;
        await Promise.all([
          this.readTargetList(rpc, { targetKind: "channel" }, epoch),
          this.readTargetList(rpc, { targetKind: "mix" }, epoch),
        ]);
      })
      .catch((error: unknown) => {
        if (epoch === this.epoch) this.lost(errorText(error));
        throw error;
      });
    this.tail = task.catch(() => undefined);
    this.refreshing = task;
    void task
      .finally(() => {
        if (this.refreshing === task) this.refreshing = undefined;
      })
      .catch(() => undefined);
    return task;
  }

  private schedulePoll(): void {
    const epoch = this.epoch;
    this.poll = this.io.schedule(() => {
      void this.refresh()
        .then(() => {
          if (!this.stopped && this.rpc && epoch === this.epoch)
            this.schedulePoll();
        })
        .catch(() => undefined);
    }, 5000);
  }

  private lost(message: string): void {
    if (this.stopped || !this.rpc) return;
    const rpc = this.rpc;
    this.rpc = undefined;
    this.epoch++;
    this.refreshing = undefined;
    if (this.poll) this.io.cancel(this.poll);
    rpc.close();
    this.state.clear();
    this.status.interfaceRevision = null;
    this.setStatus("connecting", message);
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    if (this.retry) this.io.cancel(this.retry);
    this.retry = this.io.schedule(() => {
      void this.connect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, 10000);
  }

  private setStatus(status: Snapshot["status"], message: string): void {
    const changed = this.status.status !== status;
    this.status.status = status;
    this.status.message = message;
    this.publish();
    if (changed)
      this.callbacks.connectionChanged({
        status,
        connected: status === "connected",
        message,
      });
  }

  private publish(): void {
    this.callbacks.changed(this.snapshot());
  }
}
