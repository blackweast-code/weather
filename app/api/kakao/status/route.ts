import { getKakaoConfigStatus } from "@/lib/kakao";

export async function GET() {
  return Response.json({
    configured: getKakaoConfigStatus(),
  });
}
