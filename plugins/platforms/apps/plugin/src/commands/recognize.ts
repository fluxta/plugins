import { satisfies, type Command, type Standing } from "./command";

/**
 * Why a message did not fire a Command, or that it did.
 *
 * Every rejection is silent in chat — a bot that announces "you may not do
 * that" is worse than one that says nothing. The reasons are kept apart so
 * that intent is explicit at the call site and in the tests.
 */
export type Recognition =
  | { fired: false; reason: "no-match" }
  | { fired: false; reason: "disabled"; command: Command }
  | { fired: false; reason: "not-allowed"; command: Command }
  | { fired: true; command: Command; alias: string; args: string };

/**
 * Decides whether a chat message fires one of the Commands.
 *
 * This has to live in the plugin: Fluxta's Event Filter compares with
 * equality and ordering only — there is no "starts with" — and it holds no
 * state, so neither "the message begins with !roll" nor "this viewer may use
 * it" is expressible there.
 *
 * Cooldowns are deliberately not checked here: they are the one part that
 * depends on what happened before, and mixing them in would make this
 * un-answerable from the message alone.
 */
export function recognize(
  message: string,
  standing: Standing,
  commands: readonly Command[],
): Recognition {
  const { word, args } = split(message);

  if (!word) {
    return { fired: false, reason: "no-match" };
  }

  const spoken = word.toLowerCase();

  for (const command of commands) {
    const alias = [command.name, ...command.aliases].find(
      (candidate) => candidate.toLowerCase() === spoken,
    );

    if (alias === undefined) {
      continue;
    }

    if (!command.enabled) {
      return { fired: false, reason: "disabled", command };
    }

    if (!satisfies(standing, command.permission)) {
      return { fired: false, reason: "not-allowed", command };
    }

    return { fired: true, command, alias, args };
  }

  return { fired: false, reason: "no-match" };
}

/**
 * Splits a message into its first word and everything after it.
 *
 * The remainder is left unsplit: what counts as an argument differs from
 * Command to Command, so that decision belongs to whoever reads it.
 */
function split(message: string): { word: string; args: string } {
  const trimmed = message.trim();
  const boundary = trimmed.search(/\s/);

  if (boundary === -1) {
    return { word: trimmed, args: "" };
  }

  return {
    word: trimmed.slice(0, boundary),
    args: trimmed.slice(boundary).trim(),
  };
}
