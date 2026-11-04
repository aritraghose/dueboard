import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/** What the site is, for the root page and anything without its own words. */
export const SITE_DESCRIPTION =
  "Tasks, habits, goals, notes and focus sessions on one board, with Tibo, an AI friend who plans your day with you, remembers what matters and keeps you on track.";

/** The default link-preview image (`public/og.png`, 1200×630). */
const DEFAULT_IMAGE = { path: "/og.png", width: 1200, height: 630, alt: "Dueboard: everything that's due, on one board." };

/**
 * The site's origin (`https://dueboard.com`), from the request on the server
 * and from the page in the browser, so previews get absolute URLs on any
 * domain or stage without configuration.
 */
export const siteOrigin = createIsomorphicFn()
  .server(() => new URL(getRequest().url).origin)
  .client(() => window.location.origin);

/**
 * The `<head>` meta tags for a page: its title, description and the Open
 * Graph / Twitter tags that link previews read. Open Graph tags use
 * `property` (not `name`), and tags without a value are left out instead
 * of rendered empty. A child route's tags replace the root's ones with the
 * same `name` or `property`.
 *
 * - `path`: the page's own path, for `og:url` (pair it with `canonical`).
 * - `image`: an absolute URL or a site path; the default share image otherwise.
 * - `noindex`: keep the page out of search results (link previews still work).
 */
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

/** The page's canonical URL, for `head().links`. */
export const canonical = (path: string) => ({ rel: "canonical", href: new URL(path, siteOrigin()).href });
