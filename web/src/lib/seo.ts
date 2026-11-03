/**
 * The `<head>` meta tags for a page: its title, description and the Open
 * Graph / Twitter tags that link previews read. Open Graph tags use
 * `property` (not `name`), and tags without a value are left out instead
 * of rendered empty.
 */
export function seo({
  title,
  description,
  image,
}: {
  title: string;
  description?: string;
  /** An absolute URL; link previews ignore relative ones. */
  image?: string;
}) {
  return [
    { title },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Dueboard" },
    { property: "og:title", content: title },
    { name: "twitter:title", content: title },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    ...(description
      ? [
          { name: "description", content: description },
          { property: "og:description", content: description },
          { name: "twitter:description", content: description },
        ]
      : []),
    ...(image
      ? [
          { property: "og:image", content: image },
          { name: "twitter:image", content: image },
        ]
      : []),
  ];
}
