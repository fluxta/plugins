import { ItemAction, ItemTriggerContext, Plugin } from "@fluxta/sdk/api";

/** What the generated Action Editor saves for each placement of this Action. */
type HelloSettings = {
  message?: string;
};

/**
 * The sample Item Action. Its `name` matches the manifest action `type`
 * ("test.hello") so the host can dispatch triggers to it.
 */
class HelloAction extends ItemAction<HelloSettings> {
  name = "test.hello";

  onTrigger(_: ItemTriggerContext<HelloSettings>) {
    // stdout and stderr are captured to logs/test.log inside the
    // plugin folder, so console is how a sidecar reports what it did.

    console.log(
      `[${_.trigger}] item ${_.itemId}: ${_.settings.message ?? "Hello from Fluxta!"}`,
    );
  }
}

const plugin = new Plugin();
plugin.registerAction(new HelloAction());
await plugin.connect();
