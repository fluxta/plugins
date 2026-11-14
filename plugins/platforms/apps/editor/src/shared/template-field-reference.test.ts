import { describe, expect, it } from "vitest";
import type { TemplateSource, TemplateSourceGroup } from "@fluxta/sdk/api";
import { templateFieldReference } from "./template-field-reference";

function field(overrides: Partial<TemplateSource> = {}): TemplateSource {
  return {
    group: "platforms",
    action: "chatMessage",
    key: "messageId",
    label: "Message ID",
    valueType: "string",
    params: [],
    ...overrides,
  };
}

function group(
  items: TemplateSource[],
  subgroups: TemplateSourceGroup[] = [],
): TemplateSourceGroup {
  return { key: "test", label: "Test", items, subgroups };
}

describe("templateFieldReference", () => {
  it("prefills a nested Event Field using the SDK's discriminated expression", () => {
    const groups = [group([], [group([], [group([field()])])])];
    expect(templateFieldReference(groups, "messageId")).toBe(
      '{{{"type":"source","group":"platforms","key":"messageId","action":"chatMessage","args":{}}}}',
    );
  });

  it("does not prefill from unrelated, disabled or parameterized sources", () => {
    const groups = [
      group([
        field({ group: "variables", action: undefined }),
        field({ action: "disabled", disabled: true }),
        field({ action: "query", params: [{ key: "channel", name: "Channel", editor: "text" }] }),
        field(),
      ]),
    ];
    expect(templateFieldReference(groups, "messageId")).toContain('"action":"chatMessage"');
    expect(templateFieldReference(groups, "rewardId")).toBe("");
  });

  it("keeps the full source identity for another Event Field", () => {
    const groups = [group([field({ action: "rewardRedeemed", key: "rewardId" })])];
    const expression = templateFieldReference(groups, "rewardId");
    expect(JSON.parse(expression.slice(2, -2))).toEqual({
      type: "source",
      group: "platforms",
      action: "rewardRedeemed",
      key: "rewardId",
      args: {},
    });
  });
});
