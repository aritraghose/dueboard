import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const SITE_DESCRIPTION =
  "Plan tasks, habits, goals and focus sessions with Tibo, an AI friend who changes your plan when you ask, remembers what matters and checks in on you.";

export const GITHUB_URL = "https://github.com/aritraghose/dueboard";

const DEFAULT_IMAGE = { path: "/og.png", width: 1200, height: 630, alt: "Dueboard: your day has a sidekick now." };

export const siteOrigin = createIsomorphicFn()
  .server(() => new URL(getRequest().url).origin)
  .client(() => window.location.origin);

export function seo({
  title,
  description,
  path,
  image,
  noindex = false,
}: {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  noindex?: boolean;
}) {
  const origin = siteOrigin();
  const imageUrl = new URL(image ?? DEFAULT_IMAGE.path, origin).href;
  return [
    { title },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Dueboard" },
    { property: "og:locale", content: "en_US" },
    { property: "og:title", content: title },
    { name: "twitter:title", content: title },
    { name: "twitter:card", content: "summary_large_image" },
    { property: "og:image", content: imageUrl },
    { name: "twitter:image", content: imageUrl },
    ...(image === undefined
      ? [
          { property: "og:image:width", content: String(DEFAULT_IMAGE.width) },
          { property: "og:image:height", content: String(DEFAULT_IMAGE.height) },
          { property: "og:image:alt", content: DEFAULT_IMAGE.alt },
          { name: "twitter:image:alt", content: DEFAULT_IMAGE.alt },
        ]
      : []),
    ...(description
      ? [
          { name: "description", content: description },
          { property: "og:description", content: description },
          { name: "twitter:description", content: description },
        ]
      : []),
    ...(path ? [{ property: "og:url", content: new URL(path, origin).href }] : []),
    ...(noindex ? [{ name: "robots", content: "noindex" }] : []),
  ];
}

export const canonical = (path: string) => ({ rel: "canonical", href: new URL(path, siteOrigin()).href });
