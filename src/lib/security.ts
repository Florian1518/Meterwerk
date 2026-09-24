export function isSafeStorageKey(key: string) {
  return Boolean(
    key &&
    !key.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/.test(key) &&
    !key.includes("\0") &&
    !key.split(/[\\/]/).some((part) => part === ".."),
  );
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
