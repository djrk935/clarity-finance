/** User ids are UUIDs we mint ourselves, but every store that builds a
 *  filename or SQL key from one validates here first — defense in depth so a
 *  malformed id can never become a path segment like "../". */
export function safeIdSegment(id: string): string {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) {
    throw new Error("Invalid id segment");
  }
  return id;
}
