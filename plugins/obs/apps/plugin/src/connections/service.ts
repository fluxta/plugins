import type { ConnectionStatus } from "obs-protocol";
import type { OBSWebSocket } from "obs-websocket-js";

import { ObsSession, type SessionDraft } from "./session";
import type { StoredConnection } from "./store";

/** This plugin's own Events, each addressed to the Connection they came from. */
export type ConnectionEventCallbacks = {
  onSceneChanged: (connectionId: string, sceneName: string) => void;
  onStreamStateChanged: (connectionId: string, active: boolean) => void;
  onRecordStateChanged: (connectionId: string, active: boolean, paused: boolean) => void;
  onSourceVisibilityChanged: (
    connectionId: string,
    scene: string,
    source: string,
    visible: boolean,
  ) => void;
  onInputMuteChanged: (connectionId: string, input: string, muted: boolean) => void;
  onSourceFilterEnabledChanged: (
    connectionId: string,
    source: string,
    filter: string,
    enabled: boolean,
  ) => void;
};

function draftOf(connection: StoredConnection): SessionDraft {
  return { host: connection.host, port: connection.port, password: connection.password };
}

function draftsEqual(a: SessionDraft, b: SessionDraft): boolean {
  return a.host === b.host && a.port === b.port && a.password === b.password;
}

function labelOf(connection: StoredConnection): string {
  return `${connection.name} (${connection.id.slice(0, 8)})`;
}

/**
 * Owns one {@link ObsSession} per configured Connection id, and keeps that
 * set in sync with whatever `reconcile` is next given — the settings-driven
 * connection lifecycle from ADR (reactive to Plugin Settings, no explicit
 * Connect button).
 */
export class ConnectionsService {
  private readonly sessions = new Map<string, ObsSession>();
  private readonly drafts = new Map<string, SessionDraft>();

  constructor(
    private readonly onStatusChange: () => void,
    private readonly callbacks: ConnectionEventCallbacks,
  ) {}

  /**
   * Diffs the configured list against the live sessions by id: a new id
   * opens a socket, a missing id closes one, and an existing id whose
   * host/port/password changed is reconnected with the new ones. A rename
   * alone (the id and host/port/password unchanged) touches nothing here —
   * this service never looks at `name`.
   */
  reconcile(connections: readonly StoredConnection[]): void {
    console.log(
      `[ConnectionsService] reconcile() called with ${connections.length} configured Connection(s): ` +
        connections.map((connection) => labelOf(connection)).join(", "),
    );

    const nextIds = new Set(connections.map((connection) => connection.id));

    for (const [id, session] of this.sessions) {
      if (!nextIds.has(id)) {
        console.log(`[ConnectionsService] ${id} is no longer configured — disposing`);
        session.dispose();
        this.sessions.delete(id);
        this.drafts.delete(id);
      }
    }

    for (const connection of connections) {
      const draft = draftOf(connection);
      const existing = this.sessions.get(connection.id);

      if (!existing) {
        console.log(`[ConnectionsService] ${labelOf(connection)} is new — opening`);
        this.open(connection, draft);
        continue;
      }

      const previousDraft = this.drafts.get(connection.id);
      if (!previousDraft || !draftsEqual(previousDraft, draft)) {
        console.log(
          `[ConnectionsService] ${labelOf(connection)}'s host/port/password changed — reconfiguring`,
        );
        this.drafts.set(connection.id, draft);
        existing.reconfigure(draft);
      }
    }
  }

  private open(connection: StoredConnection, draft: SessionDraft): void {
    const id = connection.id;
    this.drafts.set(id, draft);

    const session = new ObsSession(labelOf(connection), draft, this.onStatusChange, {
      onSceneChanged: (scene) => this.callbacks.onSceneChanged(id, scene),
      onStreamStateChanged: (active) => this.callbacks.onStreamStateChanged(id, active),
      onRecordStateChanged: (active, paused) =>
        this.callbacks.onRecordStateChanged(id, active, paused),
      onSourceVisibilityChanged: (scene, source, visible) =>
        this.callbacks.onSourceVisibilityChanged(id, scene, source, visible),
      onInputMuteChanged: (input, muted) => this.callbacks.onInputMuteChanged(id, input, muted),
      onSourceFilterEnabledChanged: (source, filter, enabled) =>
        this.callbacks.onSourceFilterEnabledChanged(id, source, filter, enabled),
    });

    this.sessions.set(id, session);
  }

  statusOf(id: string): ConnectionStatus | undefined {
    return this.sessions.get(id)?.statusNow();
  }

  /** The live OBS client for an id, or `undefined` if it isn't configured. */
  obsOf(id: string): OBSWebSocket | undefined {
    return this.sessions.get(id)?.obs;
  }

  /** The sole configured Connection's id, when there is exactly one (ADR-0001's auto-default). */
  soleId(): string | undefined {
    return this.sessions.size === 1 ? [...this.sessions.keys()][0] : undefined;
  }
}
