import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  // Scan logic is exercised through an injected probe so the tests stay
  // deterministic; real sockets cannot guarantee anything about the
  // neighbors of an OS-assigned port.
  it("returns the first port the probe reports as free", async () => {
    const probe = vi.fn().mockResolvedValue(true);

    await expect(
      findAvailablePort(3000, 3002, "127.0.0.1", probe),
    ).resolves.toBe(3000);
    expect(probe).toHaveBeenCalledWith(3000, "127.0.0.1");
  });

  it("skips ports the probe reports as occupied", async () => {
    const probe = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      findAvailablePort(3000, 3002, "127.0.0.1", probe),
    ).resolves.toBe(3001);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("returns null when the probe reports every port occupied", async () => {
    const probe = vi.fn().mockResolvedValue(false);

    await expect(
      findAvailablePort(3000, 3001, "127.0.0.1", probe),
    ).resolves.toBeNull();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("propagates bind errors the probe rejects with", async () => {
    const probe = vi.fn().mockRejectedValue(
      Object.assign(new Error("listen EACCES: permission denied"), {
        code: "EACCES",
      }),
    );

    await expect(
      findAvailablePort(3000, 3002, "127.0.0.1", probe),
    ).rejects.toMatchObject({ code: "EACCES" });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("probes real sockets by default", async () => {
    const server = await listen(0);
    openServers.push(server);
    const port = server.address().port;

    // One real-socket scan over exactly one occupied port: the default
    // probe reports it occupied, so the scan finds nothing.
    await expect(
      findAvailablePort(port, port, "127.0.0.1"),
    ).resolves.toBeNull();
  });
});
