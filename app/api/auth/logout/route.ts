import { clearSessionCookie } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/same-origin";

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "cache-control": "no-store",
      "set-cookie": clearSessionCookie(),
    },
  });
}
