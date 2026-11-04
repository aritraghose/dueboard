import type { SocialStatus } from "@dueboard/api/rpc";
import { Link } from "@tanstack/react-router";
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  EllipsisIcon,
  EllipsisVerticalIcon,
  SettingsIcon,
  UserCheckIcon,
  UserMinusIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSocialActions } from "@/hooks/use-social";

type Confirm = "remove" | "block" | null;

/**
 * What the viewer can do with someone, by where they stand: Connect,
 * Requested ▾ (cancel), Accept / Decline, Connected ▾ (remove), Unblock.
 * Blocking sits in a menu everywhere and asks first, as does removing.
 * `signedIn: false` offers sign-in instead. `compact` fits list rows.
 */
export function ConnectionActions({
  username,
  status,
  signedIn = true,
  compact = false,
}: {
  username: string;
  status: SocialStatus;
  signedIn?: boolean;
  compact?: boolean;
}) {
  const actions = useSocialActions();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const size = compact ? "sm" : "default";

  const go = async (call: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await call();
    } finally {
      setBusy(false);
    }
  };

  if (!signedIn) {
    return (
      <Button asChild size={size}>
        <Link to="/auth">
          <UserPlusIcon />
          Sign in to connect
        </Link>
      </Button>
    );
  }

  if (status.state === "self") {
    return (
      <Button asChild size={size} variant="outline">
        <Link to="/settings">
          <SettingsIcon />
          Settings
        </Link>
      </Button>
    );
  }

  const blockItem = (
    <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("block")}>
      <BanIcon />
      Block @{username}
    </DropdownMenuItem>
  );
  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={compact ? "icon-sm" : "icon"} variant="ghost" aria-label={`More for @${username}`} disabled={busy}>
          {compact ? <EllipsisVerticalIcon /> : <EllipsisIcon />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{blockItem}</DropdownMenuContent>
    </DropdownMenu>
  );

  let buttons: React.ReactNode;
  switch (status.state) {
    case "none":
      buttons = (
        <>
          <Button size={size} disabled={busy} onClick={() => void go(() => actions.send(username))}>
            <UserPlusIcon />
            Connect
          </Button>
          {moreMenu}
        </>
      );
      break;
    case "pending_out":
      buttons = (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size={size} variant="outline" disabled={busy}>
              <ClockIcon />
              Requested
              <ChevronDownIcon className="opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => void go(() => actions.cancel(username, status.requestId ?? ""))}
            >
              <XIcon />
              Cancel request
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {blockItem}
          </DropdownMenuContent>
        </DropdownMenu>
      );
      break;
    case "pending_in":
      buttons = (
        <>
          <Button
            size={size}
            disabled={busy}
            onClick={() => void go(() => actions.accept(username, status.requestId ?? ""))}
          >
            <CheckIcon />
            Accept
          </Button>
          <Button
            size={size}
            variant="outline"
            disabled={busy}
            onClick={() => void go(() => actions.decline(username, status.requestId ?? ""))}
          >
            Decline
          </Button>
          {moreMenu}
        </>
      );
      break;
    case "connected":
      buttons = (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size={size} variant="outline" disabled={busy}>
              <UserCheckIcon />
              Connected
              <ChevronDownIcon className="opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setConfirm("remove")}>
              <UserMinusIcon />
              Remove connection
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {blockItem}
          </DropdownMenuContent>
        </DropdownMenu>
      );
      break;
    case "blocked":
      buttons = (
        <Button
          size={size}
          variant="outline"
          disabled={busy}
          onClick={() => void go(() => actions.unblock(username))}
        >
          Unblock
        </Button>
      );
      break;
  }

  return (
    <div className="flex items-center gap-1.5">
      {buttons}
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "block" ? `Block @${username}?` : `Remove @${username}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "block"
                ? "You'll stop seeing each other, and any connection between you ends. They aren't told."
                : "They aren't told, and either of you can ask again later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "block" ? "destructive" : "default"}
              onClick={() => {
                const action = confirm;
                setConfirm(null);
                void go(() => (action === "block" ? actions.block(username) : actions.remove(username)));
              }}
            >
              {confirm === "block" ? "Block" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
