export const SOURCE_FILTER_ENABLED_CHANGED_EVENT = "source-filter-enabled-changed";

/**
 * Every field declared for `source-filter-enabled-changed` in the manifest.
 *
 * `filterName`'s `select` operand resolves against the `filters` Options
 * Source, which reads the *sibling* `sourceName` filter row's value out of
 * its own `args` to narrow the list to that Source's Filters — a host
 * capability this plugin depends on before it has shipped.
 */
export type SourceFilterEnabledChangedPayload = {
  connection: string;
  sourceName: string;
  filterName: string;
  enabled: boolean;
};

export function toSourceFilterEnabledChangedPayload(
  connectionId: string,
  sourceName: string,
  filterName: string,
  enabled: boolean,
): SourceFilterEnabledChangedPayload {
  return {
    connection: connectionId,
    sourceName,
    filterName,
    enabled,
  };
}
