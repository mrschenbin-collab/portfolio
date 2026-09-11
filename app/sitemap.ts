import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteUrl();
  const routes = [""];
  return routes.map((route) => ({ url: `${origin}${route}`, changeFrequency: "monthly" as const, priority: route === "" ? 1 : 0.7 }));
}
