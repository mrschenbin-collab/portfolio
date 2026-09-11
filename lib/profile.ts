import { profile as defaultProfile } from "@/data/profile";
import { mediaUrl } from "@/lib/file-media";
import type { StoredProfile } from "@/lib/file-store";
import { dbSelect, dbUpsert } from "@/lib/supabase";

const maxProfileImages = 3;

export type ProfileContent = {
  roleZh: string;
  intro: string;
  focus: string[];
  education: string;
  experience: string;
  awards: string;
  imageKey: string;
  imageKeys: string[];
  imageUrl: string;
  imageUrls: string[];
};

export type ProfileInput = Omit<ProfileContent, "imageUrl" | "imageUrls">;

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanImageKey(value: unknown): string {
  return clean(value, 160).replace(/[^\w.-]/g, "");
}

function parseImageKeys(payload: Record<string, unknown>): string[] {
  const values = Array.isArray(payload.imageKeys)
    ? payload.imageKeys
    : payload.imageKey
      ? [payload.imageKey]
      : [];
  return [...new Set(values.map(cleanImageKey).filter(Boolean))].slice(0, maxProfileImages);
}

function parseFocus(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : clean(value, 600).split(/[，,\n]/);
  return raw.map((item) => item.trim()).filter(Boolean).slice(0, 16);
}

function withImageUrl(profile: ProfileInput): ProfileContent {
  const imageKeys = Array.isArray(profile.imageKeys) && profile.imageKeys.length
    ? profile.imageKeys
    : profile.imageKey
      ? [profile.imageKey]
      : [];
  const limitedImageKeys = imageKeys.slice(0, maxProfileImages);
  return {
    ...profile,
    imageKey: limitedImageKeys[0] ?? "",
    imageKeys: limitedImageKeys,
    imageUrl: limitedImageKeys[0] ? mediaUrl(limitedImageKeys[0]) : "",
    imageUrls: limitedImageKeys.map((key) => mediaUrl(key)),
  };
}

function fromStored(row: StoredProfile): ProfileContent {
  return withImageUrl({
    roleZh: row.roleZh,
    intro: row.intro,
    focus: Array.isArray(row.focus) ? row.focus : [],
    education: row.education,
    experience: row.experience,
    awards: row.awards,
    imageKey: row.imageKey || "",
    imageKeys: Array.isArray(row.imageKeys) ? row.imageKeys : row.imageKey ? [row.imageKey] : [],
  });
}

export function defaultProfileContent(): ProfileContent {
  return withImageUrl({
    roleZh: defaultProfile.roleZh,
    intro: defaultProfile.intro,
    focus: defaultProfile.focus,
    education: defaultProfile.education,
    experience: defaultProfile.experience,
    awards: defaultProfile.awards,
    imageKey: "",
    imageKeys: [],
  });
}

export function parseProfileInput(payload: Record<string, unknown>): ProfileInput | { error: string } {
  const roleZh = clean(payload.roleZh, 120);
  const intro = clean(payload.intro, 2000);
  const imageKeys = parseImageKeys(payload);
  if (!roleZh) return { error: "请填写身份介绍" };
  if (!intro) return { error: "请填写自我介绍" };

  return {
    roleZh,
    intro,
    focus: parseFocus(payload.focus),
    education: clean(payload.education, 1600),
    experience: clean(payload.experience, 2400),
    awards: clean(payload.awards, 1600),
    imageKey: imageKeys[0] ?? "",
    imageKeys,
  };
}

export async function getProfile(authorId: string): Promise<ProfileContent> {
  const rows = await dbSelect<StoredProfile>("profiles", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    limit: "1",
  }));
  return rows[0] ? fromStored(rows[0]) : defaultProfileContent();
}

export async function saveProfile(authorId: string, profile: ProfileInput): Promise<ProfileContent> {
  const normalized = withImageUrl(profile);
  const stored: StoredProfile = {
    authorId,
    roleZh: normalized.roleZh,
    intro: normalized.intro,
    focus: normalized.focus,
    education: normalized.education,
    experience: normalized.experience,
    awards: normalized.awards,
    imageKey: normalized.imageKey,
    imageKeys: normalized.imageKeys,
  };
  const rows = await dbUpsert<StoredProfile>("profiles", stored, "authorId");
  return rows[0] ? fromStored(rows[0]) : normalized;
}

export function toStoredProfile(profile: ProfileContent): ProfileInput {
  return {
    roleZh: profile.roleZh,
    intro: profile.intro,
    focus: profile.focus,
    education: profile.education,
    experience: profile.experience,
    awards: profile.awards,
    imageKey: profile.imageKeys[0] ?? "",
    imageKeys: profile.imageKeys,
  };
}
