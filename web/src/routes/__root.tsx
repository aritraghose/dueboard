import { RegistryProvider } from "@effect/atom-react";
import {
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { DefaultCatchBoundary } from "../components/default-catch-boundary.tsx";
import { NotFound } from "../components/not-found.tsx";
import { ThemeProvider, themeScript } from "../components/theme-provider.tsx";
import { Toaster } from "../components/toaster.tsx";
import { TooltipProvider } from "../components/ui/tooltip.tsx";
import { SITE_DESCRIPTION, seo } from "../lib/seo.ts";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      ...seo({ title: "Dueboard", description: SITE_DESCRIPTION }),
      { name: "application-name", content: "Dueboard" },
      { name: "apple-mobile-web-app-title", content: "Dueboard" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: Document,
  component: Outlet,
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: NotFound,
});

function Document(props: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f8f3e3" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0c0c0c" />
        <ScriptOnce>{themeScript}</ScriptOnce>
      </head>
      <body>
        <RegistryProvider>
          <ThemeProvider>
            <MotionConfig reducedMotion="user">
              <TooltipProvider>
                {props.children}
                <Toaster />
              </TooltipProvider>
            </MotionConfig>
          </ThemeProvider>
        </RegistryProvider>
        <Scripts />
      </body>
    </html>
  );
}
