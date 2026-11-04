import type { Person } from "@dueboard/api/rpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/people";
import { cn } from "@/lib/utils";

export function PersonAvatar({ person, className }: { person: Person; className?: string }) {
  return (
    <Avatar className={cn("size-9", className)}>
      {person.image && <AvatarImage src={person.image} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="font-medium">{initials(person.name, person.username)}</AvatarFallback>
    </Avatar>
  );
}
