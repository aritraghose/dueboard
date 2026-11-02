import { NOTE_BODY_MAX_LENGTH, type Privacy } from "@dueboard/api/rpc";
import { GlobeIcon, LockIcon, type LucideIcon, UsersIcon } from "lucide-react";

// Notes in words and small rules the UI shares (the API checks them again).

export { NOTE_BODY_MAX_LENGTH };

/** Characters left before the 60 limit turns the counter to a warning. */
export const NOTE_WARN_AT = 10;

/**
 * The body as the API takes it: one line, trimmed. Line breaks (from a
 * paste) become spaces; the input's `maxLength` already stops the 61st
 * character.
 */
export const cleanNoteBody = (text: string): string => text.replace(/\s*[\r\n]+\s*/g, " ").trim();

export const PRIVACY_ICON: Record<Privacy, LucideIcon> = {
  public: GlobeIcon,
  connections: UsersIcon,
  private: LockIcon,
};

/** "3 notes", "1 note". */
export const noteCount = (count: number): string => `${count} ${count === 1 ? "note" : "notes"}`;
