import { Monitor, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTheme, type Theme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const themes = [
  { key: "system", icon: Monitor, label: "System theme" },
  { key: "light", icon: Sun, label: "Light theme" },
  { key: "dark", icon: Moon, label: "Dark theme" },
] satisfies { key: Theme; icon: typeof Monitor; label: string }[];

export function ThemeSwitcher({ className }: Readonly<{ className?: string }>) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The saved theme is only known in the browser, so render nothing on the
  // server and during hydration to avoid a mismatch.
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "relative isolate flex h-8 rounded-full bg-background p-1 ring-1 ring-border",
        className,
      )}
    >
      {themes.map(({ key, icon: Icon, label }) => {
        const isActive = theme === key;
        return (
          <button
            key={key}
            type="button"
            aria-label={label}
            aria-pressed={isActive}
            className="relative size-6 cursor-pointer rounded-full"
            onClick={() => setTheme(key)}
          >
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-full bg-accent"
                layoutId="activeTheme"
                transition={{ type: "spring", duration: 0.5 }}
              />
            )}
            <Icon
              className={cn(
                "relative z-10 m-auto size-4",
                isActive ? "text-accent-foreground" : "text-muted-foreground",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
