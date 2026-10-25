import { z } from "zod";

/**
 * The Account as persisted — the only place its token is kept.
 *
 * The identity outlives the token: when the token is dropped — its Sign-in
 * Expiry passed, or DonationAlerts refused it — the Account stays, without
 * one, so the editor can still say whose account to sign in again.
 */
const StoredAccountSchema = z.object({
  id: z.number(),
  name: z.string(),
  avatar: z.string(),
  /** Absent once the Account is Reauthorization Required. */
  accessToken: z.string().optional(),
  /** Epoch milliseconds: the Sign-in Expiry. */
  expiresAt: z.number(),
});

export type StoredAccount = z.infer<typeof StoredAccountSchema>;

/**
 * The plugin's whole settings blob. `setPluginSettings` replaces it outright,
 * so everything persisted lives in here and is written back together; keys
 * this build does not know are kept, so an older build never wipes a newer
 * one's section.
 */
const StoredSettingsSchema = z.record(z.string(), z.json());

type StoredSettings = z.infer<typeof StoredSettingsSchema>;

interface SettingsWriter {
  setPluginSettings(data: StoredSettings): Promise<void>;
}

/**
 * The plugin's view of its Plugin Settings, and their single writer.
 *
 * `hydrate` is driven by the SDK's `onPluginSettings`, whose first firing —
 * the settings as persisted at startup — doubles as the load step.
 */
export class AccountStore {
  private settings: StoredSettings = {};
  private account: StoredAccount | undefined;

  constructor(private readonly writer: SettingsWriter) {}

  hydrate(raw: unknown): StoredAccount | undefined {
    const settings = StoredSettingsSchema.safeParse(raw ?? {});
    this.settings = settings.success ? settings.data : {};

    if (this.settings["account"] === undefined) {
      this.account = undefined;
      return undefined;
    }

    const account = StoredAccountSchema.safeParse(this.settings["account"]);

    if (!account.success) {
      // Never log the stored value: it holds the token.
      console.error(
        "The stored Account could not be read and was ignored; sign in again",
      );
    }

    this.account = account.success ? account.data : undefined;
    return this.account;
  }

  get(): StoredAccount | undefined {
    return this.account;
  }

  async save(account: StoredAccount): Promise<void> {
    this.account = account;
    this.settings = { ...this.settings, account };
    await this.writer.setPluginSettings(this.settings);
  }

  /** Forgets the token and keeps who it belonged to. */
  async dropToken(): Promise<void> {
    if (this.account?.accessToken === undefined) {
      return;
    }

    const account = { ...this.account };
    delete account.accessToken;
    await this.save(account);
  }

  async clear(): Promise<void> {
    this.account = undefined;
    const settings = { ...this.settings };
    delete settings["account"];
    this.settings = settings;
    await this.writer.setPluginSettings(this.settings);
  }
}
