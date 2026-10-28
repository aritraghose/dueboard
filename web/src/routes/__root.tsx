import { RegistryProvider } from "@effect/atom-react";
import {
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ThemeProvider, themeScript } from "../components/theme-provider.tsx";
import { ThemeSwitcher } from "../components/theme-switcher.tsx";
import { Toaster } from "../components/toaster.tsx";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Dueboard" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <Document>
      {/* One AtomRegistry for the whole app — every AtomRpc query/mutation
          atom resolves against this registry. */}
      <RegistryProvider>
        <ThemeProvider>
          <ThemeSwitcher className="fixed top-4 right-4 z-50" />
          <Outlet />
          <Toaster />
        </ThemeProvider>
      </RegistryProvider>
    </Document>
  );
}

function Document(props: Readonly<{ children: ReactNode }>) {
  return (
    // The theme script adds `light`/`dark` to <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <ScriptOnce>{themeScript}</ScriptOnce>
      </head>
      <body>
        {props.children}
        <Scripts />
      </body>
    </html>
  );
}
