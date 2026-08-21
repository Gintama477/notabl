import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

// Static marketing/legal routes only — nothing behind auth (/dashboard,
// /admin) and no per-tenant pages (/r/[slug]) belong in a public sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const routes: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
    { path: "", changeFrequency: "weekly", priority: 1 },
    { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
    { path: "/sample-report", changeFrequency: "monthly", priority: 0.8 },
    { path: "/signup", changeFrequency: "monthly", priority: 0.7 },
    { path: "/login", changeFrequency: "yearly", priority: 0.3 },
    { path: "/legal/terms", changeFrequency: "yearly", priority: 0.2 },
    { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.2 },
    { path: "/legal/ai-disclaimer", changeFrequency: "yearly", priority: 0.2 },
  ];

  const lastModified = new Date();
  return routes.map(({ path, changeFrequency, priority }) => ({
    url: `${siteUrl}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
