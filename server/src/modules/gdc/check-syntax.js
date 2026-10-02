import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

for (const name of readdirSync(new URL(".", import.meta.url))) {
  if (name.endsWith(".js")) {
    execFileSync(process.execPath, ["--check", fileURLToPath(new URL(name, import.meta.url))], { stdio: "inherit" });
  }
}
console.log("GDC: verificación de sintaxis completa");
