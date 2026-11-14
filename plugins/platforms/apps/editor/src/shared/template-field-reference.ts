import {
  serializeExpression,
  templateSourceItems,
  type TemplateSourceGroup,
} from "@fluxta/sdk/api";

/** Find an available Event Field or preceding Action result in the source tree. */
export function templateFieldReference(groups: TemplateSourceGroup[], key: string): string {
  const source = templateSourceItems(groups).find(
    (candidate) =>
      candidate.action !== undefined &&
      candidate.key === key &&
      !candidate.disabled &&
      candidate.params.length === 0,
  );

  return source
    ? serializeExpression({
        type: "source",
        group: source.group,
        action: source.action,
        key: source.key,
        args: {},
      })
    : "";
}
