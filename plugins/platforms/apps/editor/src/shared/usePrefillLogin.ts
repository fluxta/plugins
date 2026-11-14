import { templateFieldReference } from "./template-field-reference";
import { useActionEditor } from "@fluxta/sdk/ui";
import { useEffect, useRef } from "react";

/** Event Fields that name a viewer or a channel by login, most specific first. */
const LOGIN_FIELDS = ["userLogin", "fromUserLogin"];

/**
 * Fills an empty `login` setting from whichever upstream Event's Field
 * matches one of `LOGIN_FIELDS` — the viewer a Chat Message or Cheer names,
 * or the channel a Raid or a Shoutout names.
 *
 * Only ever fills an empty field, so it cannot undo a choice, and it runs on
 * every push, because the list arrives after the first render and changes
 * again whenever the surrounding program does.
 */
export function usePrefillLogin(
  login: string,
  setLogin: (value: string) => void,
  loaded: boolean,
): void {
  const editor = useActionEditor();

  // Read through a ref rather than closed over: the listener only re-runs
  // once settings finish loading, but it must always see the latest value,
  // not whatever was on screen at that moment.
  const latest = useRef(login);
  latest.current = login;

  useEffect(() => {
    const prefill = () => {
      if (!loaded) {
        return;
      }

      const sources = editor.getTemplateSources();
      if (latest.current) {
        return;
      }

      for (const field of LOGIN_FIELDS) {
        const reference = templateFieldReference(sources, field);

        if (reference) {
          setLogin(reference);
          return;
        }
      }
    };

    const stop = editor.onTemplateSourcesChange(prefill);

    // Waits for the saved settings to land first, so this only fills what the
    // author actually left empty rather than racing the load.
    if (loaded) {
      prefill();
    }

    return stop;
  }, [editor, setLogin, loaded]);
}
