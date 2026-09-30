/** Bound each process's pool instead of Prisma's CPU-dependent default. */
export function runtimeDatabaseUrl(
  source: string | undefined,
  connectionLimit = 4,
): string | undefined {
  if (!source) return undefined;
  const url = new URL(source);
  for (const [key, value] of Object.entries({
    connection_limit: String(connectionLimit),
    pool_timeout: '5',
    connect_timeout: '5',
  })) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.toString();
}
