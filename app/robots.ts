import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

// Lets crawlers in on everything public (landing, pricing, sample report,
// legal pages, signup/login) and keeps them off routes that are either
// behind auth and useless to index (dashboard, admin) or pure API surface.
// Points at the sitemap below so Google doesn't have to discover every page
// by link-following alone.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/admin"],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
