import { NumberField, Section, SelectField } from "@fluxta/sdk/ui";
import type { ReactNode } from "react";
import type {
  RequestSongOverrides,
  RuleOverride,
} from "song-requests-protocol";

type Overrides = RequestSongOverrides;

const FOLLOW = { value: "default", label: "Follow the default" };
const CUSTOM = { value: "value", label: "Custom" };
const OFF = { value: "off", label: "Do not check" };

function modeOf(override: { mode: string } | undefined): string {
  return override?.mode ?? "default";
}

/** The value an Override carries, `undefined` unless it is in `value` mode. */
function overrideValue(
  override: RuleOverride<number> | undefined,
): number | undefined {
  return override?.mode === "value" ? override.value : undefined;
}

/**
 * The Overrides a Request Song step sets on the Rules: per Rule, follow the
 * Default, a value of its own, or do not check. An Override wins over the
 * Defaults for this step's Requests only — a "long song" Redemption, a
 * moderator's step that skips the per-Requester limit.
 */
export function OverridesSection({
  values,
  onChange,
}: {
  values: Overrides;
  onChange: (overrides: Overrides) => void;
}) {
  const setRule = <K extends keyof Overrides>(
    key: K,
    override: Overrides[K] | undefined,
  ) => {
    const next: Overrides = { ...values };
    if (override === undefined) {
      delete next[key];
    } else {
      next[key] = override;
    }
    onChange(next);
  };

  return (
    <Section
      title="Overrides"
      description="Per Rule: follow the Default from the Plugin Editor, a value of this step's own, or do not check at all. What is set here wins over the Defaults for this step's Requests only."
    >
      <SelectOverride
        label="Requests Open"
        hint="Do not check — this step's Requests are accepted even while Requests are closed."
        override={values.requestsOpen}
        options={[
          { value: "true", label: "Open" },
          { value: "false", label: "Closed" },
        ]}
        onChange={(override) => setRule("requestsOpen", override)}
        toOption={(value) => String(value)}
        toValue={(option) => option === "true"}
      />
      <MinutesOverride
        label="Longest Duration"
        hint="A longer Song is refused as too-long; without the API Key the check waits for its Start Check, unheard."
        override={values.longestDurationSeconds}
        onChange={(override) => setRule("longestDurationSeconds", override)}
      />
      <MinutesOverride
        label="Shortest Duration"
        override={values.shortestDurationSeconds}
        onChange={(override) => setRule("shortestDurationSeconds", override)}
      />
      <CountOverride
        label="Songs Waiting per Requester"
        override={values.waitingPerRequester}
        onChange={(override) => setRule("waitingPerRequester", override)}
      />
      <CountOverride
        label="Song Queue Size"
        override={values.queueSize}
        onChange={(override) => setRule("queueSize", override)}
      />
      <SelectOverride
        label="Already in the Song Queue or on Air"
        override={values.alreadyQueued}
        options={[
          { value: "refuse", label: "Refuse" },
          { value: "allow", label: "Allow" },
        ]}
        onChange={(override) => setRule("alreadyQueued", override)}
        toOption={(value) => value}
        toValue={(option) => option as "refuse" | "allow"}
      />
      <MinutesOverride
        label="Played Within"
        hint="Checked against the History. 0 — a track may play again at once."
        override={values.playedWithinSeconds}
        onChange={(override) => setRule("playedWithinSeconds", override)}
      />
      <SelectField
        label="Blocklist"
        hint="Do not check — this step's Requests are not refused for a blocked track or channel."
        value={values.blocklist?.mode ?? "default"}
        options={[FOLLOW, OFF]}
        onChange={(mode) =>
          setRule("blocklist", mode === "off" ? { mode: "off" } : undefined)
        }
      />
      <SelectOverride
        label="Music Only"
        hint="Checked only with the API Key; without it this Override checks nothing."
        override={values.musicOnly}
        options={[
          { value: "false", label: "Off" },
          { value: "true", label: "On" },
        ]}
        onChange={(override) => setRule("musicOnly", override)}
        toOption={(value) => String(value)}
        toValue={(option) => option === "true"}
      />
    </Section>
  );
}

/** The mode row every Override shares: follow the Default, a value, or off. */
function ModeSelect({
  label,
  hint,
  mode,
  withValue,
  onMode,
  children,
}: {
  label: string;
  hint?: string;
  mode: string;
  withValue: boolean;
  onMode: (mode: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SelectField
        label={label}
        hint={hint}
        value={mode}
        options={withValue ? [FOLLOW, CUSTOM, OFF] : [FOLLOW, OFF]}
        onChange={onMode}
      />
      {mode === "value" ? children : null}
    </div>
  );
}

/** An Override over a number of minutes; stored in seconds. */
function MinutesOverride({
  label,
  hint,
  override,
  onChange,
}: {
  label: string;
  hint?: string;
  override: RuleOverride<number> | undefined;
  onChange: (override: RuleOverride<number> | undefined) => void;
}) {
  const mode = modeOf(override);
  const seconds = overrideValue(override);
  return (
    <ModeSelect
      label={label}
      hint={hint}
      mode={mode}
      withValue
      onMode={(next) =>
        onChange(
          next === "default"
            ? undefined
            : next === "off"
              ? { mode: "off" }
              : { mode: "value", value: seconds ?? 0 },
        )
      }
    >
      <NumberField
        label="Minutes"
        min={0}
        value={seconds === undefined ? undefined : seconds / 60}
        onChange={(minutes) =>
          onChange({ mode: "value", value: Math.round((minutes ?? 0) * 60) })
        }
      />
    </ModeSelect>
  );
}

/** An Override over a plain count. */
function CountOverride({
  label,
  override,
  onChange,
}: {
  label: string;
  override: RuleOverride<number> | undefined;
  onChange: (override: RuleOverride<number> | undefined) => void;
}) {
  const mode = modeOf(override);
  return (
    <ModeSelect
      label={label}
      mode={mode}
      withValue
      onMode={(next) =>
        onChange(
          next === "default"
            ? undefined
            : next === "off"
              ? { mode: "off" }
              : { mode: "value", value: overrideValue(override) ?? 1 },
        )
      }
    >
      <NumberField
        label="Songs"
        min={0}
        value={overrideValue(override)}
        onChange={(value) =>
          onChange({ mode: "value", value: Math.round(value ?? 0) })
        }
      />
    </ModeSelect>
  );
}

/** An Override over one of two named values. */
function SelectOverride<V extends string | boolean>({
  label,
  hint,
  override,
  options,
  onChange,
  toOption,
  toValue,
}: {
  label: string;
  hint?: string;
  override: RuleOverride<V> | undefined;
  options: readonly { value: string; label: string }[];
  onChange: (override: RuleOverride<V> | undefined) => void;
  toOption: (value: V) => string;
  toValue: (option: string) => V;
}) {
  const mode = modeOf(override);
  return (
    <ModeSelect
      label={label}
      hint={hint}
      mode={mode}
      withValue
      onMode={(next) =>
        onChange(
          next === "default"
            ? undefined
            : next === "off"
              ? { mode: "off" }
              : {
                  mode: "value",
                  value:
                    override?.mode === "value"
                      ? override.value
                      : toValue(options[0].value),
                },
        )
      }
    >
      <SelectField
        label="Value"
        value={
          override?.mode === "value"
            ? toOption(override.value)
            : options[0].value
        }
        options={options}
        onChange={(option) =>
          onChange({ mode: "value", value: toValue(option) })
        }
      />
    </ModeSelect>
  );
}
