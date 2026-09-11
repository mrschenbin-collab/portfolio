import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import type { Metadata } from "sharp";
import {
  createSignedStorageReadUrl,
  createSignedStorageUpload,
  downloadStorageObject,
  removeStorageObjects,
  uploadStorageObject,
} from "@/lib/supabase";

export const allowedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export const allowedVideoTypes = new Map([
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/quicktime", "mov"],
  ["video/x-m4v", "m4v"],
]);

const maxImageBytes = 15 * 1024 * 1024;
const maxImageSide = 12000;
const maxImagePixels = 80_000_000;
const maxVideoBytes = 200 * 1024 * 1024;
const tempPrefix = "tmp";
const mediaPrefix = "media";

type DetectedImage = {
  extension: "jpg" | "png" | "webp" | "gif";
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};

type DetectedVideo = {
  extension: "mp4" | "webm" | "mov" | "m4v";
  contentType: "video/mp4" | "video/webm" | "video/quicktime" | "video/x-m4v";
};

export type ImageUploadTicket = {
  tempKey: string;
  signedUrl: string;
};

export function cleanMediaKey(value: string): string {
  return path.basename(value).replace(/[^\w.-]/g, "");
}

export function mediaUrl(key: string): string {
  return `/api/media/${encodeURIComponent(cleanMediaKey(key))}`;
}

function safeSegment(value: string, fallback: string): string {
  return value.replace(/[^\w-]/g, "").slice(0, 48) || fallback;
}

function detectImage(buffer: Buffer): DetectedImage | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return { extension: "png", contentType: "image/png" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { extension: "webp", contentType: "image/webp" };
  }
  if (buffer.length >= 6) {
    const signature = buffer.toString("ascii", 0, 6);
    if (signature === "GIF87a" || signature === "GIF89a") return { extension: "gif", contentType: "image/gif" };
  }
  return null;
}

function detectVideo(buffer: Buffer, declaredType = ""): DetectedVideo | null {
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (brand === "qt  ") return { extension: "mov", contentType: "video/quicktime" };
    if (declaredType === "video/x-m4v") return { extension: "m4v", contentType: "video/x-m4v" };
    return { extension: "mp4", contentType: "video/mp4" };
  }
  if (
    buffer.length >= 4
    && buffer[0] === 0x1a
    && buffer[1] === 0x45
    && buffer[2] === 0xdf
    && buffer[3] === 0xa3
  ) {
    return { extension: "webm", contentType: "video/webm" };
  }
  return null;
}

async function prepareImageBuffer(original: Buffer, declaredType = ""): Promise<{ body: Buffer; extension: DetectedImage["extension"]; contentType: DetectedImage["contentType"] }> {
  if (!original.length || original.length > maxImageBytes) throw new Error("单张图片不能超过十五兆");
  if (declaredType && !allowedImageTypes.has(declaredType)) throw new Error("仅支持 JPG、PNG、WEBP 或 GIF 图片");

  const detected = detectImage(original);
  if (!detected) throw new Error("图片格式无效，请上传真实的 JPG、PNG、WEBP 或 GIF 文件");
  if (declaredType && declaredType !== detected.contentType) throw new Error("图片实际格式与文件类型不一致，请重新导出后上传");

  let metadata: Metadata;
  try {
    metadata = await sharp(original, { animated: detected.extension === "gif" }).metadata();
  } catch {
    throw new Error("图片文件无法读取，请重新导出后上传");
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new Error("图片尺寸无法识别，请重新导出后上传");
  if (width > maxImageSide || height > maxImageSide || width * height > maxImagePixels) {
    throw new Error("图片尺寸过大，请压缩到 12000 像素以内后上传");
  }

  // Re-encoding removes EXIF/metadata for the common static formats.
  if (detected.extension === "jpg") {
    return {
      extension: "jpg",
      contentType: "image/jpeg",
      body: await sharp(original).rotate().jpeg({ quality: 92, mozjpeg: true }).toBuffer(),
    };
  }
  if (detected.extension === "png") {
    return {
      extension: "png",
      contentType: "image/png",
      body: await sharp(original).png({ compressionLevel: 9 }).toBuffer(),
    };
  }
  if (detected.extension === "webp") {
    return {
      extension: "webp",
      contentType: "image/webp",
      body: await sharp(original).webp({ quality: 92 }).toBuffer(),
    };
  }

  // Preserve animated GIFs. The final object stays private and is still signature/dimension checked.
  return { extension: "gif", contentType: "image/gif", body: original };
}

function prepareVideoBuffer(original: Buffer, declaredType = ""): { body: Buffer; extension: DetectedVideo["extension"]; contentType: DetectedVideo["contentType"] } {
  if (!original.length || original.length > maxVideoBytes) throw new Error("单个视频不能超过 200MB");
  if (declaredType && !allowedVideoTypes.has(declaredType)) throw new Error("仅支持 MP4、WEBM、MOV 或 M4V 视频");

  const detected = detectVideo(original, declaredType);
  if (!detected) throw new Error("视频格式无效，请上传真实的 MP4、WEBM、MOV 或 M4V 文件");
  if (
    declaredType
    && declaredType !== detected.contentType
    && !(declaredType === "video/quicktime" && detected.contentType === "video/mp4")
    && !(declaredType === "video/mp4" && detected.contentType === "video/quicktime")
  ) {
    throw new Error("视频实际格式与文件类型不一致，请重新导出后上传");
  }

  return { ...detected, body: original };
}

export async function createImageUploadTicket(
  userId: string,
  input: { name?: unknown; type?: unknown; size?: unknown },
): Promise<ImageUploadTicket> {
  const size = Number(input.size);
  const declaredType = typeof input.type === "string" ? input.type : "";
  if (!Number.isFinite(size) || size <= 0 || size > maxImageBytes) throw new Error("单张图片不能超过十五兆");
  if (!allowedImageTypes.has(declaredType)) throw new Error("仅支持 JPG、PNG、WEBP 或 GIF 图片");

  const extension = allowedImageTypes.get(declaredType) ?? "bin";
  const userSegment = safeSegment(userId, "user");
  const tempKey = `${tempPrefix}/${userSegment}/${Date.now()}-${randomUUID()}.${extension}`;
  const { signedUrl } = await createSignedStorageUpload(tempKey);
  return { tempKey, signedUrl };
}

export async function createVideoUploadTicket(
  userId: string,
  input: { name?: unknown; type?: unknown; size?: unknown },
): Promise<ImageUploadTicket> {
  const size = Number(input.size);
  const declaredType = typeof input.type === "string" ? input.type : "";
  if (!Number.isFinite(size) || size <= 0 || size > maxVideoBytes) throw new Error("单个视频不能超过 200MB");
  if (!allowedVideoTypes.has(declaredType)) throw new Error("仅支持 MP4、WEBM、MOV 或 M4V 视频");

  const extension = allowedVideoTypes.get(declaredType) ?? "bin";
  const userSegment = safeSegment(userId, "user");
  const tempKey = `${tempPrefix}/${userSegment}/${Date.now()}-${randomUUID()}.${extension}`;
  const { signedUrl } = await createSignedStorageUpload(tempKey);
  return { tempKey, signedUrl };
}

export async function finalizeImageUpload(userId: string, tempKey: string, prefix: string): Promise<string> {
  const userSegment = safeSegment(userId, "user");
  const normalizedTempKey = String(tempKey || "").replace(/^\/+/, "");
  if (!normalizedTempKey.startsWith(`${tempPrefix}/${userSegment}/`) || normalizedTempKey.includes("..")) {
    throw new Error("临时上传凭据无效");
  }

  try {
    const temporary = await downloadStorageObject(normalizedTempKey);
    if (temporary.body.length > maxImageBytes) throw new Error("单张图片不能超过十五兆");
    const storedType = temporary.contentType.split(";")[0]?.trim() ?? "";
    const declaredType = allowedImageTypes.has(storedType) ? storedType : "";
    const prepared = await prepareImageBuffer(temporary.body, declaredType);
    if (prepared.body.length > maxImageBytes) throw new Error("处理后的图片超过十五兆，请压缩后重试");

    const safePrefix = safeSegment(prefix, "image").slice(0, 32);
    const key = `${safePrefix}-${randomUUID()}.${prepared.extension}`;
    await uploadStorageObject(`${mediaPrefix}/${key}`, prepared.body, prepared.contentType);
    return key;
  } finally {
    await removeStorageObjects([normalizedTempKey]).catch(() => undefined);
  }
}

export async function finalizeVideoUpload(userId: string, tempKey: string, prefix: string): Promise<string> {
  const userSegment = safeSegment(userId, "user");
  const normalizedTempKey = String(tempKey || "").replace(/^\/+/, "");
  if (!normalizedTempKey.startsWith(`${tempPrefix}/${userSegment}/`) || normalizedTempKey.includes("..")) {
    throw new Error("临时上传凭据无效");
  }

  try {
    const temporary = await downloadStorageObject(normalizedTempKey);
    if (temporary.body.length > maxVideoBytes) throw new Error("单个视频不能超过 200MB");
    const storedType = temporary.contentType.split(";")[0]?.trim() ?? "";
    const declaredType = allowedVideoTypes.has(storedType) ? storedType : "";
    const prepared = prepareVideoBuffer(temporary.body, declaredType);

    const safePrefix = safeSegment(prefix, "video").slice(0, 32);
    const key = `${safePrefix}-${randomUUID()}.${prepared.extension}`;
    await uploadStorageObject(`${mediaPrefix}/${key}`, prepared.body, prepared.contentType);
    return key;
  } finally {
    await removeStorageObjects([normalizedTempKey]).catch(() => undefined);
  }
}

export async function deleteImageFile(key: string): Promise<void> {
  const safeKey = cleanMediaKey(key);
  if (!safeKey) return;
  await removeStorageObjects([`${mediaPrefix}/${safeKey}`]);
}

export async function deleteVideoFile(key: string): Promise<void> {
  await deleteImageFile(key);
}

export async function createMediaReadUrl(key: string, expiresIn = 60): Promise<string | null> {
  const safeKey = cleanMediaKey(key);
  if (!safeKey) return null;
  return createSignedStorageReadUrl(`${mediaPrefix}/${safeKey}`, expiresIn);
}

export async function createImageReadUrl(key: string, expiresIn = 60): Promise<string | null> {
  return createMediaReadUrl(key, expiresIn);
}
