import { spawn } from "node:child_process";
import os from "node:os";

const lan = process.env.DEV_LAN === "true";
const host = lan ? "0.0.0.0" : "127.0.0.1";
const port = process.env.PORT ?? "3000";

console.log(`Starting Work Timer on http://127.0.0.1:${port}`);

if (lan) {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        console.log(`LAN: http://${address.address}:${port}`);
      }
    }
  }
}

const child = spawn(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "next", "dev", "--hostname", host, "--port", port],
  { stdio: "inherit", env: process.env },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
