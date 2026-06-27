import { getKakaoConfigStatus, sendKakaoMemo } from "@/lib/kakao";

type SendPayload = {
  region?: string;
  decision?: string;
  summary?: string;
  high?: number;
  low?: number;
  maxPop?: number;
  detailUrl?: string;
};

function normalizePayload(payload: SendPayload) {
  return {
    region: payload.region?.trim() || "서울 성동구",
    decision: payload.decision?.trim() || "우산 필요",
    summary:
      payload.summary?.trim() ||
      "오후 3시 이후 비 예보가 있어 우산이 필요합니다.",
    high: typeof payload.high === "number" ? payload.high : 27,
    low: typeof payload.low === "number" ? payload.low : 21,
    maxPop: typeof payload.maxPop === "number" ? payload.maxPop : 70,
    detailUrl: payload.detailUrl?.trim(),
  };
}

export async function POST(request: Request) {
  const status = getKakaoConfigStatus();

  if (!status.sendReady) {
    return Response.json(
      {
        error:
          "카카오 발송 환경변수가 아직 준비되지 않았습니다. KAKAO_REST_API_KEY와 KAKAO_REFRESH_TOKEN을 설정하세요.",
        configured: status,
      },
      { status: 409 },
    );
  }

  try {
    const payload = (await request.json()) as SendPayload;
    const result = await sendKakaoMemo(normalizePayload(payload));

    return Response.json({
      ok: true,
      result: result.result,
      rotatedRefreshToken: Boolean(result.rotatedRefreshToken),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "카카오톡 발송에 실패했습니다.";

    return Response.json({ error: message }, { status: 502 });
  }
}
