import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptySnapshot, type Snapshot } from "wave-link-protocol";
import { ActionEditorPage } from "./ActionEditorPage";

function render(status?: Snapshot) {
  return renderToStaticMarkup(
    <ActionEditorPage
      target={{ targetKind: "channel" }}
      onTargetChange={() => {}}
      status={status}
      field="volumePercent"
    >
      <input aria-label="Volume" />
    </ActionEditorPage>,
  );
}

describe("ActionEditorPage connection notice", () => {
  it("does not add a notice before the plugin answers", () => {
    const html = render();
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Waiting for the Wave Link plugin");
  });

  it("does not add a notice while Wave Link is being discovered", () => {
    const status = emptySnapshot();
    expect(render(status)).not.toContain(status.message);
  });

  it("shows the confirmed connection failure", () => {
    const status: Snapshot = {
      ...emptySnapshot(),
      status: "error",
      message: "Wave Link 3 was not found. Start Wave Link.",
    };
    const html = render(status);
    expect(html).toContain('role="alert"');
    expect(html).toContain(status.message);
  });

  it("keeps the notice hidden when connected", () => {
    const status: Snapshot = {
      ...emptySnapshot(),
      status: "connected",
      message: "Connected to local Wave Link 3.",
    };
    const html = render(status);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain(status.message);
  });
});
