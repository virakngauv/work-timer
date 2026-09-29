import net from "node:net";

// Next.js 16 no longer falls back to another port when the requested one is
// taken, so callers probe upward from the requested port before spawning.
export function isPortFree(port, host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => {
      // Only a port that is already in use means "try the next one"; other
      // bind failures (EACCES, EMFILE, ...) must reach the caller as-is.
      if (error.code === "EADDRINUSE") resolve(false);
      else reject(error);
    });
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export async function findAvailablePort(start, end, host) {
  for (let port = start; port <= end; port += 1) {
    if (await isPortFree(port, host)) return port;
  }
  return null;
}
