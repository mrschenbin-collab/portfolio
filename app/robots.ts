import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/login", "/work", "/community", "/archive", "/about", "/lab"] },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
