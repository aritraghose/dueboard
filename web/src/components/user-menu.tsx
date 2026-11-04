import { Link } from "@tanstack/react-router";
import {
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  UserRoundIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useTheme, type Theme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/people";
import { cn } from "@/lib/utils";
import { authClient } from "../auth-client.ts";

export type MenuUser = {
  readonly name: string;
  readonly username: string;
  readonly image: string | null;
};

export function UserAvatar({ user, className }: { user: MenuUser; className?: string }) {
  return (
    <Avatar className={cn("size-8", className)}>
      {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback>{initials(user.name, user.username)}</AvatarFallback>
    </Avatar>
  );
}

const THEMES = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] satisfies { value: Theme; label: string; icon: LucideIcon }[];

export function UserMenuContent({
  user,
  ...props
}: { user: MenuUser } & React.ComponentProps<typeof DropdownMenuContent>) {
  const { theme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await authClient.signOut();
    window.location.assign("/");
  };

  return (
    <DropdownMenuContent className="w-60" {...props}>
      <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
        <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
        <span className="truncate text-xs font-normal text-muted-foreground">@{user.username}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link to="/@{$username}" params={{ username: user.username }}>
          <UserRoundIcon />
          Your profile
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/connections">
          <UsersIcon />
          My connections
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/settings">
          <SettingsIcon />
          Settings
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
        {THEMES.map(({ value, label, icon: Icon }) => (
          <DropdownMenuRadioItem key={value} value={value}>
            <Icon />
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={signingOut}
        onSelect={(event) => {
          event.preventDefault();
          void signOut();
        }}
      >
        <LogOutIcon />
        {signingOut ? "Signing out…" : "Sign out"}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
