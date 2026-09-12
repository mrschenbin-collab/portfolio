import { apiError, requireAdminUser } from "@/lib/admin-auth";
import { deleteImageFile, finalizeImageUpload } from "@/lib/file-media";
import { getProfile, saveProfile, toStoredProfile } from "@/lib/profile";

const maxAwardImages = 8;

export async function POST(request: Request) {
  let storedKey = "";
  try {
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const current = await getProfile(user.id);
    if (current.awardImageKeys.length >= maxAwardImages) return Response.json({ error: "奖项与展览图片最多上传八张" }, { status: 400 });

    const payload = await request.json() as Record<string, unknown>;
    const tempKey = typeof payload.tempKey === "string" ? payload.tempKey : "";
    if (!tempKey) return Response.json({ error: "上传凭据无效" }, { status: 400 });

    storedKey = await finalizeImageUpload(user.id, tempKey, `${user.id}-award`);
    const profile = await saveProfile(user.id, {
      ...toStoredProfile(current),
      awardImageKeys: [...current.awardImageKeys, storedKey],
    });
    return Response.json({ profile }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (storedKey) await deleteImageFile(storedKey).catch(() => undefined);
    if (error instanceof Error && /图片|十五兆|像素|JPG|PNG|WEBP|GIF|上传|凭据/.test(error.message)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const current = await getProfile(user.id);
    const key = new URL(request.url).searchParams.get("key") ?? "";
    const keysToDelete = key ? current.awardImageKeys.filter((imageKey) => imageKey === key) : current.awardImageKeys;
    if (key && keysToDelete.length === 0) return Response.json({ error: "奖项与展览图片不存在" }, { status: 404 });

    await Promise.all(keysToDelete.map((imageKey) => deleteImageFile(imageKey).catch(() => undefined)));
    const awardImageKeys = key ? current.awardImageKeys.filter((imageKey) => imageKey !== key) : [];
    const profile = await saveProfile(user.id, { ...toStoredProfile(current), awardImageKeys });
    return Response.json({ profile }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
