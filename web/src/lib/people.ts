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
