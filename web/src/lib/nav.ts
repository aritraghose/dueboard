import {
  BookOpenIcon,
  LibraryIcon,
  ListChecksIcon,
  MessageCircleIcon,
  NotebookPenIcon,
  RadioIcon,
  RepeatIcon,
  SearchIcon,
  SettingsIcon,
  HouseIcon,
  TargetIcon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react";

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
    | "/discover"
    | "/leaderboard"
    | "/settings";
  readonly label: string;
  readonly icon: LucideIcon;
};

export const MAIN_NAV: readonly NavItem[] = [
  { to: "/now", label: "Now", icon: HouseIcon },
  { to: "/inbox", label: "Inbox", icon: MessageCircleIcon },
  { to: "/boards", label: "Boards", icon: LibraryIcon },
];

export type Board = NavItem & {
  readonly description: string;
};

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

export const DISCOVER_NAV: NavItem = { to: "/discover", label: "Discover", icon: SearchIcon };

export const LEADERBOARD_NAV: NavItem = { to: "/leaderboard", label: "Leaderboard", icon: TrendingUpIcon };

export const BOARD_EXTRAS: readonly Board[] = [
  {
    to: "/leaderboard",
    label: "Leaderboard",
    icon: TrendingUpIcon,
    description: "Who's scoring most, among your connections or everyone.",
  },
  {
    to: "/discover",
    label: "Discover",
    icon: SearchIcon,
    description: "Find people and answer connection requests.",
  },
  {
    to: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    description: "Privacy defaults, Tibo, blocked people and your account.",
  },
];
