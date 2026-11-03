// People in words: initials for avatars without a picture.

/** Up to two initials from a display name ("Ada Lovelace" → "AL"), or the username's first letter. */
export function initials(name: string, username: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]!.toUpperCase())
    .join("");
  return letters || username.slice(0, 1).toUpperCase();
}
