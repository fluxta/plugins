import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@fluxta/sdk/ui";
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
 * in itself (ADR-0001's auto-default), so asking would be a choice with only
 * one answer.
 */
export function ConnectionSelect({ connections, value, onChange }: Props) {
  if (connections.length <= 1) {
    return null;
  }

  const missing = !!value && !connections.some((connection) => connection.id === value);

  return (
    <div className="space-y-2">
      <Label htmlFor="connection">Connection</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger id="connection" className="w-full">
          <SelectValue placeholder="Choose a Connection" />
        </SelectTrigger>
        <SelectContent>
          {missing ? (
            // Keeps a saved choice visible rather than silently emptying the
            // field: the Connection may have been deleted, or renamed by an
            // id this instance no longer matches.
            <SelectItem value={value}>A Connection that no longer exists</SelectItem>
          ) : null}
          {connections.map((connection) => (
            <SelectItem key={connection.id} value={connection.id}>
              {connection.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
