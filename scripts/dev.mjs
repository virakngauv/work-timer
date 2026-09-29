import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";

const lan = process.env.DEV_LAN === "true";
const host = lan ? "0.0.0.0" : "127.0.0.1";
const requestedPort = Number(process.env.PORT ?? "3000");

// Next.js 16 no longer falls back to another port when the requested one is
// taken, so probe upward from the requested port before spawning.
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

async function findAvailablePort(start) {
  const maxPort = start + 10;
  for (let port = start; port < maxPort; port += 1) {
    if (await isPortFree(port)) return port;
  }
  return null;
}

const port = await findAvailablePort(requestedPort);

if (!port) {
  console.error(
    `No available port between ${requestedPort} and ${requestedPort + 9}. ` +
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
