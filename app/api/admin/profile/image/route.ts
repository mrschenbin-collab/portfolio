import { apiError, requireAdminUser } from "@/lib/admin-auth";
import { deleteImageFile, finalizeImageUpload } from "@/lib/file-media";
import { getProfile, saveProfile, toStoredProfile } from "@/lib/profile";
import { assertSameOrigin } from "@/lib/same-origin";

const maxProfileImages = 3;

export async function POST(request: Request) {
  let storedKey = "";
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const current = await getProfile(user.id);
    if (current.imageKeys.length >= maxProfileImages) return Response.json({ error: "本人介绍最多上传三张图片" }, { status: 400 });

    const payload = await request.json() as Record<string, unknown>;
    const tempKey = typeof payload.tempKey === "string" ? payload.tempKey : "";
    if (!tempKey) return Response.json({ error: "上传凭据无效" }, { status: 400 });

    storedKey = await finalizeImageUpload(user.id, tempKey, `${user.id}-profile`);
    const profile = await saveProfile(user.id, {
      ...toStoredProfile(current),
      imageKeys: [...current.imageKeys, storedKey],
      imageKey: current.imageKeys[0] ?? storedKey,
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
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const current = await getProfile(user.id);
    const key = new URL(request.url).searchParams.get("key") ?? "";
    const keysToDelete = key ? current.imageKeys.filter((imageKey) => imageKey === key) : current.imageKeys;
    if (key && keysToDelete.length === 0) return Response.json({ error: "本人图片不存在" }, { status: 404 });
    await Promise.all(keysToDelete.map((imageKey) => deleteImageFile(imageKey).catch(() => undefined)));
    const imageKeys = key ? current.imageKeys.filter((imageKey) => imageKey !== key) : [];
    const profile = await saveProfile(user.id, { ...toStoredProfile(current), imageKey: imageKeys[0] ?? "", imageKeys });
    return Response.json({ profile }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
