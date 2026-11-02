import {
  BookOpenIcon,
  InboxIcon,
  LayoutGridIcon,
  ListChecksIcon,
  NotebookPenIcon,
  RadioIcon,
  RepeatIcon,
  SettingsIcon,
  SunriseIcon,
  TargetIcon,
  type LucideIcon,
} from "lucide-react";

// The app's navigation, shared by the desktop sidebar, the phone tab bar and
// the Boards page.

export type NavItem = {
  readonly to:
    | "/now"
    | "/inbox"
    | "/boards"
    | "/tasks"
    | "/habits"
    | "/goals"
    | "/notes"
    | "/live"
    | "/diary"
    | "/settings";
  readonly label: string;
  readonly icon: LucideIcon;
};

/** The top of the sidebar, and the phone tab bar (with Profile after it). */
export const MAIN_NAV: readonly NavItem[] = [
  { to: "/now", label: "Now", icon: SunriseIcon },
  { to: "/inbox", label: "Inbox", icon: InboxIcon },
  { to: "/boards", label: "Boards", icon: LayoutGridIcon },
];

export type Board = NavItem & {
  /** What the board holds, for its card on the Boards page. */
  readonly description: string;
};

/** Every board: cards on `/boards`, and Boards' subsection in the expanded sidebar. */
export const BOARDS: readonly Board[] = [
  {
    to: "/tasks",
    label: "Tasks",
    icon: ListChecksIcon,
    description: "Everything you need to do, dated or not.",
  },
  {
    to: "/habits",
    label: "Habits",
    icon: RepeatIcon,
    description: "What you do again and again, and your streaks.",
  },
  {
    to: "/goals",
    label: "Goals",
    icon: TargetIcon,
    description: "Where you're headed, and how far you've come.",
  },
  {
    to: "/notes",
    label: "Notes",
    icon: NotebookPenIcon,
    description: "Short notes on your days, 60 characters at a time.",
  },
  {
    to: "/live",
    label: "Live",
    icon: RadioIcon,
    description: "What you and your connections get done, as it happens.",
  },
  {
    to: "/diary",
    label: "Diary",
    icon: BookOpenIcon,
    description: "Your days, as they happened.",
  },
];

export const SETTINGS_NAV: NavItem = { to: "/settings", label: "Settings", icon: SettingsIcon };
