import { Button, Field, Input } from "@fluxta/sdk/ui";
import { useRef, useState, type ReactNode } from "react";

/**
 * An address to copy, read-only — for one that goes into another app, as the
 * Player Page's does into OBS.
 */
export function CopyField({
  label,
  hint,
  value,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // The editor's sandboxed frame may not be granted the clipboard; a
      // selected field copies the old way.
      input.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <Input
          ref={input}
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          aria-label={label}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!value}
          onClick={copy}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </Field>
  );
}
