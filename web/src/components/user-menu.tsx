import { Link } from "@tanstack/react-router";
import {
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  UserRoundIcon,
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
      <AvatarFallback>{user.username.slice(0, 1).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

const THEMES = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] satisfies { value: Theme; label: string; icon: LucideIcon }[];

/**
 * The avatar menu: profile, theme and sign out. On phones it also holds
 * Settings, which has no place of its own in the phone nav.
 */
export function UserMenuContent({
  user,
  withSettings = false,
  ...props
}: { user: MenuUser; withSettings?: boolean } & React.ComponentProps<typeof DropdownMenuContent>) {
  const { theme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await authClient.signOut();
    // A full page load also drops every cached query atom of this user.
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
        {/* `/@username` is built in step 13; a plain link until the route exists. */}
        <a href={`/@${user.username}`}>
          <UserRoundIcon />
          Your profile
        </a>
      </DropdownMenuItem>
      {withSettings && (
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <SettingsIcon />
            Settings
          </Link>
        </DropdownMenuItem>
      )}
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
