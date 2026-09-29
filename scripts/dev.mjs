import { spawn } from "node:child_process";
import os from "node:os";
import { findAvailablePort } from "./port-probe.mjs";

const lan = process.env.DEV_LAN === "true";
const host = lan ? "0.0.0.0" : "127.0.0.1";
const requestedPort = Number(process.env.PORT ?? "3000");

if (
  !Number.isInteger(requestedPort) ||
  requestedPort < 1 ||
  requestedPort > 65535
) {
  console.error(
    `PORT must be an integer between 1 and 65535 (got "${process.env.PORT ?? ""}").`,
  );
  process.exit(1);
}

// Next.js 16 no longer falls back to another port when the requested one is
// taken, so probe upward from the requested port before spawning. Probe at
// most ten ports and never past the top of the TCP port range; the exhaustion
// error below reports this exact range.
const lastProbedPort = Math.min(requestedPort + 9, 65535);

let port;
try {
  port = await findAvailablePort(requestedPort, lastProbedPort, host);
} catch (error) {
  console.error(`Could not check port availability: ${error.message}`);
  process.exit(1);
}

if (!port) {
  console.error(
    `No available port between ${requestedPort} and ${lastProbedPort}. ` +
      "Free one of those ports or set PORT to a free port.",
  );
  process.exit(1);
}

if (port !== requestedPort) {
  console.log(`Port ${requestedPort} is in use; using ${port} instead.`);
}

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
  ["exec", "next", "dev", "--hostname", host, "--port", String(port)],
  { stdio: "inherit", env: process.env },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
