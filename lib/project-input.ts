export type ProjectInput = {
  slug: string;
  title: string;
  year: string;
  category: string;
  summary: string;
  context: string;
  concept: string;
  tags: string;
  tone: string;
  status: "draft" | "published";
  featured: boolean;
};

const tones = new Set(["tone-red", "tone-ink", "tone-blue", "tone-green", "tone-yellow", "tone-mono"]);

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function cleanSlug(value: unknown): string {
  return clean(value, 80)
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseProjectInput(payload: Record<string, unknown>): ProjectInput | { error: string } {
  const title = clean(payload.title, 120);
  const category = clean(payload.category, 60);
  const year = clean(payload.year, 8);
  if (!title) return { error: "请填写作品名称" };
  if (!category) return { error: "请填写作品类别" };
  if (!/^\d{4}$/.test(year)) return { error: "年份需填写四位数字" };

  const rawTags = Array.isArray(payload.tags)
    ? payload.tags.filter((tag): tag is string => typeof tag === "string")
    : clean(payload.tags, 300).split(/[，,]/);
  const tags = rawTags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
  const status = payload.status === "draft" ? "draft" : "published";
  const tone = typeof payload.tone === "string" && tones.has(payload.tone) ? payload.tone : "tone-ink";

  return {
    slug: cleanSlug(payload.slug) || `zuopin-${crypto.randomUUID().slice(0, 8)}`,
    title,
    year,
    category,
    summary: clean(payload.summary, 800),
    context: clean(payload.context, 4000),
    concept: clean(payload.concept, 4000),
    tags: JSON.stringify(tags),
    tone,
    status,
    featured: payload.featured === true,
  };
}

export function parseProjectVisibilityInput(payload: Record<string, unknown>): { status: "draft" | "published" } | { error: string } {
  if (payload.status === "draft" || payload.status === "published") return { status: payload.status };
  return { error: "作品状态无效" };
}
