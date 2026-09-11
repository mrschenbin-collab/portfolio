import { getCurrentUser, type AppUser } from "@/lib/auth";

export async function requireAdminUser(): Promise<AppUser | Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401, headers: { "cache-control": "no-store" } });
  return user;
}

export async function checkAdminRequest(): Promise<Response | null> {
  const user = await requireAdminUser();
  return user instanceof Response ? user : null;
}

export function apiError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "操作失败";
  if (/23505|duplicate key value|unique constraint/i.test(message)) {
    if (/users.*email|email.*users/i.test(message)) return Response.json({ error: "这个邮箱已经注册，可以直接登录" }, { status: 409, headers: { "cache-control": "no-store" } });
    return Response.json({ error: "网址标识已存在，请换一个" }, { status: 409, headers: { "cache-control": "no-store" } });
  }
  if (/Missing required SUPABASE_|42P01|relation .* does not exist|Supabase .* failed \(5\d\d\)/i.test(message)) {
    console.error(error);
    return Response.json({ error: "数据存储暂时不可用" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  console.error(error);
  return Response.json({ error: "操作失败，请稍后重试" }, { status: 500, headers: { "cache-control": "no-store" } });
}
