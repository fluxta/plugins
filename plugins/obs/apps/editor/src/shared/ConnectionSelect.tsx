import { SelectField } from "@fluxta/sdk/ui";
import type { ConnectionEntry } from "obs-protocol";

type Props = {
  connections: ConnectionEntry[];
  value: string | undefined;
  onChange: (id: string) => void;
};

/**
 * Picks which configured Connection an Action or Value Source acts on.
 *
 * Hidden entirely when at most one Connection is configured: with none,
 * there is nothing to pick from yet; with exactly one, the plugin fills it
 * in itself (the auto-default), so asking would be a choice with only one
 * answer.
 */
export function ConnectionSelect({ connections, value, onChange }: Props) {
  if (connections.length <= 1) {
    return null;
  }

  return (
    <SelectField
      label="Connection"
      placeholder="Choose a Connection"
      options={connections.map((connection) => ({
        value: connection.id,
        label: connection.name,
      }))}
      value={value}
      onChange={onChange}
      missingLabel="A Connection that no longer exists"
    />
  );
}
