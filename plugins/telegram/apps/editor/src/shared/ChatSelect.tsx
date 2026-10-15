import { SelectField } from "@fluxta/sdk/ui";
import type { ChatEntry } from "telegram-protocol";

type Props = {
  chats: ChatEntry[];
  value: string | undefined;
  onChange: (id: string) => void;
};

/**
 * Picks which configured Chat an Action posts to.
 *
 * Hidden entirely when at most one Chat is configured: with none, there is
 * nothing to pick from yet; with exactly one, the plugin uses it on its own,
 * so asking would be a choice with only one answer.
 */
export function ChatSelect({ chats, value, onChange }: Props) {
  if (chats.length <= 1) {
    return null;
  }

  return (
    <SelectField
      label="Chat"
      placeholder="Choose a Chat"
      options={chats.map((chat) => ({ value: chat.id, label: chat.name }))}
      value={value}
      onChange={onChange}
      missingLabel="A Chat that no longer exists"
    />
  );
}
