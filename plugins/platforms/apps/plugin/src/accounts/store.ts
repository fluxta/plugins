import { z } from "zod";

import { plugin } from "../plugin";

import { CommandSchema, type AccountRole, type Command } from "platforms-protocol";


/**
 * One Account as it is persisted.
 *
 * The identity outlives the tokens on purpose: when a refresh token dies the
 * editor should still be able to say *whose* account needs signing in again,
 * so `tokens` goes missing while `login` stays.
 */
const StoredAccountSchema = z.object({
  userId: z.string(),
  login: z.string(),
  displayName: z.string(),
  /**
   * Stored in twurple's `AccessToken` shape, so the token that comes out of
   * settings can be handed to an `AuthProvider` without a translation step —
   * and so this never needs migrating once the API client arrives.
   */
  tokens: z
    .object({
      accessToken: z.string(),
      refreshToken: z.string().nullable(),
      scope: z.array(z.string()),
      expiresIn: z.number().nullable(),
      obtainmentTimestamp: z.number(),
    })
    .optional(),
});

export type StoredAccount = z.infer<typeof StoredAccountSchema>;

/**
 * The plugin's whole settings blob. `setPluginSettings` replaces the stored
 * value outright, so everything the plugin persists has to live in here and be
 * written back together.
 *
 * Unknown keys are kept: a build that predates a future section must not wipe
 * it on the next write.
 */
const SettingsSchema = z.looseObject({
  accounts: z
    .object({
      broadcaster: StoredAccountSchema.optional(),
      bot: StoredAccountSchema.optional(),
    })
    .default({}),
  commands: z.array(CommandSchema).default([]),
});

export type Settings = z.infer<typeof SettingsSchema>;

const EMPTY: Settings = { accounts: {}, commands: [] };

/**
 * Reads and writes the plugin settings, keeping the last known value in memory
 * so a partial update never drops a sibling section.
 */
export class SettingsStore {
  private current: Settings = EMPTY;

  async load(): Promise<Settings> {
    const stored = await plugin.getPluginSettings();

    // Nothing has ever been saved — the normal state on a fresh install, not a
    // mismatch worth reporting.
    if (stored.payload === null || stored.payload === undefined) {
      this.current = EMPTY;
      return this.current;
    }

    const parsed = SettingsSchema.safeParse(stored.payload);

    if (!parsed.success) {
      // Stored JSON can predate the current shape. Starting from empty is
      // better than crashing the sidecar on every start. The payload is never
      // logged — it holds tokens.
      console.error(
        "Stored settings could not be read and were ignored; connect the accounts again",
      );
      this.current = EMPTY;
      return this.current;
    }

    this.current = parsed.data;
    return this.current;
  }

  /** Replaces one Account and persists the whole blob. */
  async saveAccount(role: AccountRole, account: StoredAccount | undefined): Promise<void> {
    this.current = {
      ...this.current,
      accounts: { ...this.current.accounts, [role]: account },
    };

    await this.persist();
  }

  private async persist(): Promise<void> {
    await plugin.setPluginSettings(toJson(this.current));
  }

  get(role: AccountRole): StoredAccount | undefined {
    return this.current.accounts[role];
  }

  commands(): Command[] {
    return this.current.commands;
  }

  /** Adds a Command, or replaces the one with the same id. */
  async saveCommand(command: Command): Promise<void> {
    const commands = [...this.current.commands];
    const index = commands.findIndex((existing) => existing.id === command.id);

    if (index === -1) {
      commands.push(command);
    } else {
      commands[index] = command;
    }

    this.current = { ...this.current, commands };
    await this.persist();
  }

  async deleteCommand(id: string): Promise<void> {
    this.current = {
      ...this.current,
      commands: this.current.commands.filter((command) => command.id !== id),
    };
    await this.persist();
  }
}

type Json = null | string | number | boolean | Json[] | { [key: string]: Json };

/**
 * The SDK constrains settings to a JSON type it does not export, and the
 * round trip earns its keep anyway: `JSON.stringify` drops keys whose value is
 * `undefined`, so removing an Account leaves no empty slot behind.
 */
function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
