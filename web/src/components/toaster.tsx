import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/components/theme-provider";

// Sonner's <Toaster />, following the theme switcher instead of always light.
// Show toasts with `toast()` from "sonner".
export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  return <Sonner theme={theme} {...props} />;
}
