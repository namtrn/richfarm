const chains = new Map<string, Promise<void>>();

/** Serializes commands per scoped plant while allowing unrelated plants to proceed. */
export async function serializePlantCommand<T>(
  scope: string,
  plantUuid: string,
  command: () => Promise<T>,
): Promise<T> {
  const key = `${scope}\u0000${plantUuid}`;
  const previous = chains.get(key) ?? Promise.resolve();
  let result!: T;
  const run = previous.catch(() => undefined).then(async () => {
    result = await command();
  });
  chains.set(key, run);
  try {
    await run;
    return result;
  } finally {
    if (chains.get(key) === run) chains.delete(key);
  }
}
