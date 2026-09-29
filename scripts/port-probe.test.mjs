import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  findAvailablePort,
  isPortFree,
  isRetryableBindError,
} from "./port-probe.mjs";

function listen(port, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.once("listening", () => resolve(server));
    server.listen(port, host);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

const openServers = [];

afterEach(() => {
  for (const server of openServers.splice(0)) server.close();
});

describe("isRetryableBindError", () => {
  it("treats EADDRINUSE as retryable", () => {
    expect(
      isRetryableBindError(
        Object.assign(new Error("listen EADDRINUSE: address already in use"), {
          code: "EADDRINUSE",
        }),
      ),
    ).toBe(true);
  });

  it("treats every other bind error as terminal", () => {
    expect(
      isRetryableBindError(
        Object.assign(new Error("listen EACCES: permission denied"), {
          code: "EACCES",
        }),
      ),
    ).toBe(false);
    expect(
      isRetryableBindError(
        Object.assign(new Error("listen EMFILE: too many open files"), {
          code: "EMFILE",
        }),
      ),
    ).toBe(false);
  });

  it("treats missing or malformed errors as terminal", () => {
    expect(isRetryableBindError(undefined)).toBe(false);
    expect(isRetryableBindError("EADDRINUSE")).toBe(false);
    expect(isRetryableBindError(new Error("no code"))).toBe(false);
  });
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
});

describe("findAvailablePort", () => {
  it("returns the start port when it is free", async () => {
    // Let the OS pick a port that is currently free, release it, and scan
    // exactly that port.
    const probe = await listen(0);
    const port = probe.address().port;
    await closeServer(probe);

    await expect(findAvailablePort(port, port, "127.0.0.1")).resolves.toBe(
      port,
    );
  });

  it("skips an occupied port and returns the next free one", async () => {
    // Let the OS pick a port that is currently free, then occupy the port
    // before it so the scan must skip exactly one occupied port and land on
    // a port that is known to be free.
    const probe = await listen(0);
    const freePort = probe.address().port;
    await closeServer(probe);
    const occupied = await listen(freePort - 1);
    openServers.push(occupied);

    await expect(
      findAvailablePort(freePort - 1, freePort, "127.0.0.1"),
    ).resolves.toBe(freePort);
  });

  it("returns null when every port in the range is occupied", async () => {
    const server = await listen(0);
    openServers.push(server);
    const port = server.address().port;

    await expect(
      findAvailablePort(port, port, "127.0.0.1"),
    ).resolves.toBeNull();
  });
});
