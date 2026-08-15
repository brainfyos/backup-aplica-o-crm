function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseEvolutionConnectionState(value: unknown): boolean | null {
  const root = isRecord(value) ? value : null;
  const data = isRecord(root?.data) ? root.data : null;
  const instance = isRecord(data?.instance)
    ? data.instance
    : (isRecord(root?.instance) ? root.instance : null);
  const sources = [data, instance, root].filter((source): source is Record<string, unknown> => !!source);

  // LoggedIn describes the usable WhatsApp session and is authoritative when
  // Evolution Go includes it. Connected is retained for older server versions.
  for (const source of sources) {
    const loggedIn = source.LoggedIn ?? source.loggedIn;
    if (typeof loggedIn === "boolean") return loggedIn;
  }
  for (const source of sources) {
    const connected = source.Connected ?? source.connected;
    if (typeof connected === "boolean") return connected;
  }
  for (const source of sources) {
    const rawState = source.connectionStatus ?? source.connection ?? source.state ?? source.status;
    if (typeof rawState !== "string") continue;
    const state = rawState.toLowerCase();
    if (["open", "connected", "loggedin", "logged_in"].includes(state)) return true;
    if (["close", "closed", "disconnected", "loggedout", "logged_out"].includes(state)) return false;
  }
  return null;
}
