// Serialize callbacks like the browser's exclusive Web Lock for unit tests.
export function installWebLocks(): void {
  let queue = Promise.resolve();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: (_name: string, callback: () => unknown) => {
        const result = queue.then(callback);
        queue = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    },
  });
}
