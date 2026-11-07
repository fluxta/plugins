import { Plugin } from "@fluxta/sdk/api";
import { registerPlugin } from "./runtime";

const plugin = new Plugin();
const service = registerPlugin(plugin);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    service.stop();
    process.exit(0);
  });
}
await plugin.connect();
await service.start();
