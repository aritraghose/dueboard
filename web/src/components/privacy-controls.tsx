import { PRIVACY, type Privacy } from "@dueboard/api/rpc";
import { ChevronDownIcon, EyeOffIcon, RadioIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRIVACY_ICON } from "@/lib/notes";
import { PRIVACY_HINT, PRIVACY_LABEL } from "@/lib/privacy";
import { cn } from "@/lib/utils";

// The small pills that pick who sees an item and whether it goes to Live,
// shared by the note composer and the focus session form.

/** Who can see it: a pill that opens the three choices with their hints. */
export function PrivacyPill({ value, onChange }: { value: Privacy; onChange: (value: Privacy) => void }) {
  const Icon = PRIVACY_ICON[value];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 rounded-full px-2 text-xs text-primary hover:text-primary dark:text-foreground"
          aria-label={`Who can see it: ${PRIVACY_LABEL[value]}`}
        >
          <Icon />
          {PRIVACY_LABEL[value]}
          <ChevronDownIcon className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as Privacy)}>
          {PRIVACY.map((option) => {
            const OptionIcon = PRIVACY_ICON[option];
            return (
              <DropdownMenuRadioItem key={option} value={option} className="items-start py-2">
                <OptionIcon className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span>{PRIVACY_LABEL[option]}</span>
                  <span className="text-xs text-muted-foreground">{PRIVACY_HINT[option]}</span>
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "On Live" / "Off Live": whether it shows on Live. */
export function LiveToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className={cn(
        "h-6 rounded-full px-2 text-xs",
        value ? "text-success-ink hover:text-success-ink" : "text-muted-foreground",
      )}
    >
      {value ? <RadioIcon /> : <EyeOffIcon />}
      {value ? "On Live" : "Off Live"}
    </Button>
  );
}
