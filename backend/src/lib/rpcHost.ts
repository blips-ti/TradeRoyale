// Host only — a dedicated RPC URL carries an API key in its path/query, so never log/return the full URL.
export function rpcHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return "<invalid-url>";
  }
}

// viem folds the full request URL (key in path/query) into err.message — redact the raw RPC URL to
// its host before any error string is returned in an API response or log.
export function redactRpcUrl(message: string, rawUrl: string): string {
  if (!rawUrl) return message;
  return message.split(rawUrl).join(rpcHost(rawUrl));
}
