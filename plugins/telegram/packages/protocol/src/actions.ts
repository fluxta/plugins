/**
 * Send Message's settings, as its Action Editor saves them.
 *
 * `chat` is a Chat's id; unset means the sole configured Chat, so settings
 * saved before a second Chat existed keep working. `text` is edited through
 * a `TemplateField`, so by the time the sidecar reads it the host may have
 * substituted it into a number or a boolean — read it with `templatedText`.
 */
export type SendMessageSettings = {
  chat?: string;
  text?: string;
};

/**
 * Edit Message's settings, as its Action Editor saves them.
 *
 * `chat` works as in Send Message. `messageId` and `text` are edited through
 * `TemplateField`s: `messageId` is usually one reference — to Send Message's
 * Message ID in the same run, or to the Global Variable a run kept it in — so
 * it can arrive as a number; read it with `templatedNumber`, and `text` with
 * `templatedText`.
 */
export type EditMessageSettings = {
  chat?: string;
  messageId?: string | number;
  text?: string;
};
