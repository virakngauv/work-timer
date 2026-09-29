import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { findAvailablePort, isPortFree } from "./port-probe.mjs";

function listen(port, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.once("listening", () => resolve(server));
    server.listen(port, host);
  });
}

const openServers = [];

afterEach(() => {
  for (const server of openServers.splice(0)) server.close();
});

describe("isPortFree", () => {
  it("resolves true for a port nothing is listening on", async () => {
    await expect(isPortFree(0, "127.0.0.1")).resolves.toBe(true);
  });

  it("resolves false only when the port is already in use", async () => {
    const server = await listen(0);
    openServers.push(server);
    const port = server.address().port;

    await expect(isPortFree(port, "127.0.0.1")).resolves.toBe(false);
  });

  it("rejects with the real error when the port cannot be probed", async () => {
    // Privileged ports fail with EACCES for unprivileged users on unix; the
    // assumption does not hold on Windows or when running as root.
    if (process.platform === "win32" || process.getuid?.() === 0) return;

    await expect(isPortFree(1, "127.0.0.1")).rejects.toMatchObject({
      code: "EACCES",
    });
  });
});

describe("findAvailablePort", () => {
  it("returns the start port when it is free", async () => {
    await expect(isPortFree(0, "127.0.0.1")).resolves.toBe(true);
    await expect(findAvailablePort(0, 0, "127.0.0.1")).resolves.toBe(0);
  });

  it("skips an occupied port and returns the next free one", async () => {
    const occupied = await listen(0);
    openServers.push(occupied);
    const port = occupied.address().port;

    await expect(findAvailablePort(port, port + 1, "127.0.0.1")).resolves.toBe(
      port + 1,
    );
  });

  it("returns null when every port in the range is occupied", async () => {
    const server = await listen(0);
    openServers.push(server);
    const port = server.address().port;

    await expect(
      findAvailablePort(port, port, "127.0.0.1"),
    ).resolves.toBeNull();
  });

  it("propagates bind errors that are not EADDRINUSE", async () => {
    if (process.platform === "win32" || process.getuid?.() === 0) return;

    await expect(findAvailablePort(1, 3, "127.0.0.1")).rejects.toMatchObject({
      code: "EACCES",
    });
  });
});
