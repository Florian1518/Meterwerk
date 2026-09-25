export function isSafeStorageKey(key: string) {
  return /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/.test(key);
}

export function sessionCookieSecure(
  environment: string | undefined,
  nodeEnv = process.env.NODE_ENV,
) {
  return (
    nodeEnv === "production" ||
    environment === "pilot" ||
    environment === "production"
  );
}
