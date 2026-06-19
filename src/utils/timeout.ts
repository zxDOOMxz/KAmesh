export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMsg: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[Timeout] ${errorMsg} (${ms}ms)`)), ms),
    ),
  ]);
}
