
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
mkdirSync("dist/" + manifest.name, { recursive: true });
writeFileSync("dist/" + manifest.name + "/manifest.json", JSON.stringify(manifest, null, 2));
writeFileSync("dist/" + manifest.name + "/index.js", "console.log('hi')");
