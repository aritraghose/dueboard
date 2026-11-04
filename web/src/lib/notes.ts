import { NOTE_BODY_MAX_LENGTH, type Privacy } from "@dueboard/api/rpc";
import { GlobeIcon, LockIcon, type LucideIcon, UsersIcon } from "lucide-react";

export { NOTE_BODY_MAX_LENGTH };

export const NOTE_WARN_AT = 10;

export const cleanNoteBody = (text: string): string => text.replace(/\s*[\r\n]+\s*/g, " ").trim();

export const PRIVACY_ICON: Record<Privacy, LucideIcon> = {
  public: GlobeIcon,
  connections: UsersIcon,
  private: LockIcon,
};

export const noteCount = (count: number): string => `${count} ${count === 1 ? "note" : "notes"}`;
