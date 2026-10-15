import { SelectField } from "@fluxta/sdk/ui";
import type { PluginStatus } from "timers-protocol";

type Props = {
  status: PluginStatus | undefined;
  value: string | undefined;
  onChange: (value: string) => void;
  hint?: string;
};

/** The Timer an Action acts on, picked by name and saved by id. */
export function TimerField({ status, value, onChange, hint }: Props) {
  const timers = status?.timers ?? [];

  return (
    <>
      {status && timers.length === 0 ? (
        <p className="text-muted-foreground text-xs/relaxed">
          No Timer yet. Add one in the Timers plugin’s settings.
        </p>
      ) : null}
      <SelectField
        label="Timer"
        placeholder="Choose a Timer"
        options={timers.map((timer) => ({
          value: timer.id,
          label: timer.name,
        }))}
        loading={!status}
        value={value}
        onChange={onChange}
        missingLabel="A Timer that no longer exists"
        hint={hint}
      />
    </>
  );
}
