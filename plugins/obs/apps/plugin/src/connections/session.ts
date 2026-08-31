import { OBSWebSocket } from "obs-websocket-js";
import type { ConnectionStatus } from "obs-protocol";

import { sourceNameForSceneItem } from "../obs/sources";
import { Backoff } from "./backoff";

export type SessionDraft = { host: string; port: number; password?: string };

/** Callbacks for this session's own OBS events — the caller adds the Connection id. */
export type SessionEventHandlers = {
  onSceneChanged: (sceneName: string) => void;
  onStreamStateChanged: (active: boolean) => void;
  onRecordStateChanged: (active: boolean, paused: boolean) => void;
  onSourceVisibilityChanged: (scene: string, source: string, visible: boolean) => void;
  onInputMuteChanged: (input: string, muted: boolean) => void;
  onSourceFilterEnabledChanged: (source: string, filter: string, enabled: boolean) => void;
};

const RECORD_PAUSED_STATE = "OBS_WEBSOCKET_OUTPUT_PAUSED";

/**
 * One OBS Studio WebSocket link, with its own indefinite reconnect loop.
 *
 * OBS being closed, not yet started, or unreachable is an expected, ordinary
 * state for a Connection to sit in — not a fault the plugin gives up over —
 * so this retries forever with a capped, doubling backoff (see
 * {@link Backoff}) rather than surfacing a terminal error.
 */
export class ObsSession {
  readonly obs = new OBSWebSocket();

  private draft: SessionDraft;
  private readonly backoff = new Backoff();
  private status: ConnectionStatus = { status: "connecting" };
  private disposed = false;
  private retryTimer?: ReturnType<typeof setTimeout>;

  constructor(
    /** For log prefixing only — e.g. "Main PC (a1b2c3d4)" — so a shared log makes sense with several Connections. */
    private readonly label: string,
    draft: SessionDraft,
    private readonly onStatusChange: () => void,
    private readonly handlers: SessionEventHandlers,
  ) {
    this.draft = draft;
    this.wireEvents();
    this.attemptConnect();
  }

  statusNow(): ConnectionStatus {
    return this.status;
  }

  /** The host/port/password behind this id changed — reconnect with the new ones. */
  reconfigure(draft: SessionDraft): void {
    this.log(`settings changed (now ws://${draft.host}:${draft.port}) — reconnecting`);
    this.draft = draft;
    this.backoff.reset();
    this.clearRetry();
    void this.teardownSocket();
    this.setStatus({ status: "connecting" });
    this.attemptConnect();
  }

  /** This id was removed from the configured list — stop retrying and close the socket. */
  dispose(): void {
    this.log("removed — disposing");
    this.disposed = true;
    this.clearRetry();
    void this.teardownSocket();
  }

  private log(message: string): void {
    console.log(`[${this.label}] ${message}`);
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.onStatusChange();
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  private async teardownSocket(): Promise<void> {
    try {
      await this.obs.disconnect();
    } catch {
      // Already down — there is nothing to clean up.
    }
  }

  private wireEvents(): void {
    this.obs.on("ConnectionClosed", (data) => {
      this.log(`ConnectionClosed event fired (disposed=${this.disposed})`);
      console.log(data);
      if (this.disposed) return;
      this.setStatus({ status: "connecting" });
      this.scheduleRetry();
    });

    this.obs.on("ConnectionError", (data) => {
      this.log("ConnectionError event fired");
      console.log(data);
    });

    this.obs.on("ConnectionOpened", () => {
      this.log("ConnectionOpened event fired");
    });

    this.obs.on("Identified", () => {
      this.log("Identified event fired");
    });

    this.obs.on("CurrentProgramSceneChanged", (data) => {
      this.handlers.onSceneChanged(data.sceneName);
    });

    this.obs.on("StreamStateChanged", (data) => {
      this.handlers.onStreamStateChanged(data.outputActive);
    });

    this.obs.on("RecordStateChanged", (data) => {
      const paused = data.outputState === RECORD_PAUSED_STATE;
      this.handlers.onRecordStateChanged(data.outputActive, paused);
    });

    this.obs.on("SceneItemEnableStateChanged", (data) => {
      void this.forwardSceneItemEnableChanged(data.sceneName, data.sceneItemId, data.sceneItemEnabled);
    });

    this.obs.on("InputMuteStateChanged", (data) => {
      this.handlers.onInputMuteChanged(data.inputName, data.inputMuted);
    });

    this.obs.on("SourceFilterEnableStateChanged", (data) => {
      this.handlers.onSourceFilterEnabledChanged(data.sourceName, data.filterName, data.filterEnabled);
    });
  }

  /**
   * `SceneItemEnableStateChanged` names its Scene Item only by id — resolve
   * it back to a Source name before this plugin's own Event fires (this
   * plugin never surfaces a Scene Item id itself). If the lookup fails
   * (the Source or Scene vanished in the same instant), the OBS event is
   * dropped rather than emitted half-populated.
   */
  private async forwardSceneItemEnableChanged(
    scene: string,
    sceneItemId: number,
    visible: boolean,
  ): Promise<void> {
    try {
      const source = await sourceNameForSceneItem(this.obs, scene, sceneItemId);
      this.handlers.onSourceVisibilityChanged(scene, source, visible);
    } catch (error) {
      console.warn(
        `Could not resolve which Source scene item ${sceneItemId} in "${scene}" refers to:`,
        error,
      );
    }
  }

  /**
   * A single failed connect fires both a rejected `connect()` promise and a
   * `ConnectionClosed` event, and both call this — guard against the second
   * call piling a duplicate retry on top of the first, which would otherwise
   * double the number of live retry chains on every failure (an exponential
   * connection storm; see the retryTimer clear below for the other half of
   * the fix).
   */
  private scheduleRetry(): void {
    if (this.disposed || this.retryTimer) return;
    const delay = this.backoff.next();
    this.log(`scheduling a retry in ${delay}ms`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.attemptConnect();
    }, delay);
    this.retryTimer.unref?.();
  }

  private attemptConnect(): void {
    if (this.disposed) return;

    const url = `ws://${this.draft.host}:${this.draft.port}`;
    this.log(`attempting to connect to ${url}`);

    this.obs
      .connect(url, this.draft.password)
      .then(() => {
        this.log("connected");
        this.backoff.reset();
        this.setStatus({ status: "connected" });
      })
      .catch((error: unknown) => {
        if (this.disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        this.log(`connect failed: ${message}`);
        console.log(error);
        this.setStatus({ status: "error", message });
        this.scheduleRetry();
      });
  }
}
