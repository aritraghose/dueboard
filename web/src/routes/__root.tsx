import { RegistryProvider } from "@effect/atom-react";
import {
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DefaultCatchBoundary } from "../components/default-catch-boundary.tsx";
import { NotFound } from "../components/not-found.tsx";
import { ThemeProvider, themeScript } from "../components/theme-provider.tsx";
import { Toaster } from "../components/toaster.tsx";
import { TooltipProvider } from "../components/ui/tooltip.tsx";
import { seo } from "../lib/seo.ts";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      ...seo({
        title: "Dueboard",
        description:
          "Bills, renewals, returns and deadlines in one place, sorted by when they're due, so nothing slips past.",
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // The logo (`public/logo.svg`) is the only icon: the tab, the
      // installed app (`site.webmanifest`) and the home screen.
      { rel: "icon", type: "image/svg+xml", href: "/logo.svg" },
      { rel: "apple-touch-icon", href: "/logo.svg" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  // The shell wraps every screen, including the error and not-found ones
  // below, so they get the document, theme and providers too.
  shellComponent: Document,
  component: Outlet,
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: NotFound,
});

function Document(props: Readonly<{ children: ReactNode }>) {
  return (
    // The theme script adds `light`/`dark` to <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* The browser bar takes the page's top color in each theme. Here
            rather than in `head`, which keeps one meta tag per name. */}
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f8f3e3" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0c0c0c" />
        <ScriptOnce>{themeScript}</ScriptOnce>
      </head>
      <body>
        {/* One AtomRegistry for the whole app — every AtomRpc query/mutation
            atom resolves against this registry. */}
        <RegistryProvider>
          <ThemeProvider>
            <TooltipProvider>
              {props.children}
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </RegistryProvider>
        <Scripts />
      </body>
    </html>
  );
}
