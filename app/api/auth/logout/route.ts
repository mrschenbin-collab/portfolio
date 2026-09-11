import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "cache-control": "no-store",
      "set-cookie": clearSessionCookie(),
    },
  });
}
