import { createMediaReadUrl } from "@/lib/file-media";
import { getCurrentUser } from "@/lib/auth";
import { canReadMediaKey } from "@/lib/portfolio";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("请先登录", { status: 401, headers: { "cache-control": "no-store" } });

  const key = (await params).key;
  if (!await canReadMediaKey(user.id, key)) return new Response("媒体不存在", { status: 404, headers: { "cache-control": "no-store" } });

  try {
    const signedUrl = await createMediaReadUrl(key, 60);
    if (!signedUrl) return new Response("媒体不存在", { status: 404, headers: { "cache-control": "no-store" } });
    return new Response(null, {
      status: 307,
      headers: {
        location: signedUrl,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("媒体暂时无法读取", { status: 503, headers: { "cache-control": "no-store" } });
  }
}
