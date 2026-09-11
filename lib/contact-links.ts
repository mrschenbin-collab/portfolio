import type { StoredContactLink } from "@/lib/file-store";
import { dbDelete, dbSelect, dbUpsert } from "@/lib/supabase";

export type ContactKind = "email" | "social" | "portfolio" | "other";

export type ContactLink = {
  id: string;
  kind: ContactKind;
  label: string;
  value: string;
  href: string;
  sortOrder: number;
};

const allowedKinds = new Set<ContactKind>(["email", "social", "portfolio", "other"]);

export const defaultContactLinks: ContactLink[] = [
  { id: "default-email", kind: "email", label: "电子邮箱", value: "联系方式待补充", href: "", sortOrder: 0 },
  { id: "default-social", kind: "social", label: "社交平台", value: "链接待补充", href: "", sortOrder: 1 },
  { id: "default-portfolio", kind: "portfolio", label: "作品平台", value: "链接待补充", href: "", sortOrder: 2 },
];

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanId(value: unknown): string {
  const id = clean(value, 80).replace(/[^\p{L}\p{N}_-]/gu, "");
  return id || crypto.randomUUID();
}

function normalizeHref(kind: ContactKind, value: string, href: string): string {
  const candidate = href.trim();
  if (!candidate && kind === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return `mailto:${value}`;
  }
  if (!candidate) return "";
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(candidate)) return candidate;
  if (/^https?:\/\/[^\s]+$/i.test(candidate)) return candidate;
  if (/^(www\.|[\w-]+(\.[\w-]+)+\/?)/i.test(candidate)) return `https://${candidate}`;
  return "";
}

export function parseContactLinksInput(payload: Record<string, unknown>): ContactLink[] | { error: string } {
  if (!Array.isArray(payload.links)) return { error: "联系信息格式无效" };

  const links: ContactLink[] = [];
  for (const [index, item] of payload.links.entries()) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const kind = allowedKinds.has(row.kind as ContactKind) ? row.kind as ContactKind : "other";
    const label = clean(row.label, 60);
    const value = clean(row.value, 180);
    const href = normalizeHref(kind, value, clean(row.href, 300));
    if (!label || !value) continue;
    links.push({
      id: cleanId(row.id),
      kind,
      label,
      value,
      href,
      sortOrder: Number.isInteger(row.sortOrder) ? Number(row.sortOrder) : index,
    });
  }

  if (links.length > 24) return { error: "联系入口最多保留二十四个" };
  return links.sort((a, b) => a.sortOrder - b.sortOrder).map((link, index) => ({ ...link, sortOrder: index }));
}

function fromStored(row: StoredContactLink): ContactLink {
  return {
    id: row.id,
    kind: allowedKinds.has(row.kind as ContactKind) ? row.kind as ContactKind : "other",
    label: row.label,
    value: row.value,
    href: row.href,
    sortOrder: row.sortOrder,
  };
}

export async function getContactLinks(authorId: string): Promise<ContactLink[]> {
  const rows = await dbSelect<StoredContactLink>("contact_links", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    order: "sortOrder.asc,id.asc",
  }));
  return rows.length ? rows.map(fromStored) : defaultContactLinks;
}

export async function saveContactLinks(authorId: string, links: ContactLink[]): Promise<ContactLink[]> {
  const existing = await dbSelect<StoredContactLink>("contact_links", new URLSearchParams({
    select: "id",
    authorId: `eq.${authorId}`,
  }));

  const rows = links.length
    ? await dbUpsert<StoredContactLink>("contact_links", links.map((link, index) => ({
      authorId,
      ...link,
      sortOrder: index,
    })), "authorId,id")
    : [];

  const retained = new Set(links.map((link) => link.id));
  await Promise.all(existing
    .filter((row) => !retained.has(row.id))
    .map((row) => dbDelete<StoredContactLink>("contact_links", new URLSearchParams({
      authorId: `eq.${authorId}`,
      id: `eq.${row.id}`,
    }))));

  return rows.map(fromStored).sort((a, b) => a.sortOrder - b.sortOrder);
}
