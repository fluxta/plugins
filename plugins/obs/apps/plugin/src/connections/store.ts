import type { Connection, ConnectionDraft } from "obs-protocol";

export type StoredConnection = { id: string } & ConnectionDraft;

export type StoredSettings = { connections?: StoredConnection[] };

interface SettingsWriter {
  setPluginSettings(data: StoredSettings): Promise<void>;
}

/**
 * The plugin's own view of the persisted Connection list. It is the single
 * writer of Plugin Settings for this plugin, which is what lets `update`
 * merge in a change without ever having to reconstruct another Connection's
 * password — or even the one being edited, if its password is left blank —
 * from what an editor sent it, since the editor never has one to send.
 *
 * `hydrate` is driven by the SDK's `onPluginSettings`, whose first firing
 * (the persisted settings as they were at startup) doubles as this store's
 * load step; there is no separate one.
 */
export class ConnectionsStore {
  private connections: StoredConnection[] = [];

  constructor(private readonly plugin: SettingsWriter) {}

  hydrate(settings: StoredSettings | null | undefined): readonly StoredConnection[] {
    this.connections = settings?.connections ?? [];
    return this.connections;
  }

  list(): readonly StoredConnection[] {
    return this.connections;
  }

  get(id: string): StoredConnection | undefined {
    return this.connections.find((connection) => connection.id === id);
  }

  /** For validation: what an editor sees, redacting the password. */
  redacted(): Connection[] {
    return this.connections.map(({ id, name, host, port, password }) => ({
      id,
      name,
      host,
      port,
      hasPassword: Boolean(password),
    }));
  }

  async create(id: string, draft: ConnectionDraft): Promise<void> {
    this.connections = [...this.connections, { id, ...draft }];
    await this.persist();
  }

  async update(id: string, draft: ConnectionDraft): Promise<void> {
    this.connections = this.connections.map((existing) =>
      existing.id === id
        ? { ...existing, ...draft, password: draft.password ?? existing.password }
        : existing,
    );
    await this.persist();
  }

  async remove(id: string): Promise<void> {
    this.connections = this.connections.filter((connection) => connection.id !== id);
    await this.persist();
  }

  private async persist(): Promise<void> {
    const settings: StoredSettings = { connections: this.connections };
    await this.plugin.setPluginSettings(settings);
  }
}
