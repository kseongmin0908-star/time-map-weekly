// Supabase Edge Function: Claude AI Analysis Proxy
// Keeps the Claude API key server-side (set via: supabase secrets set CLAUDE_API_KEY=sk-ant-...)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY");
    if (!CLAUDE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "CLAUDE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { retros, period } = await req.json();

    if (!retros || retros.length === 0) {
      return new Response(
        JSON.stringify({ analysis: "분석할 회고 데이터가 없습니다." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build period label
    const periodLabels: Record<string, string> = {
      day: "오늘 하루",
      week: "이번 주",
      month: "이번 달",
      year: "올해",
      all: "전체 기간",
    };
    const periodLabel = periodLabels[period] || period;

    // Format retros for Claude
    const retroSummary = retros
      .map(
        (r: any) =>
          `[${r.date}] 점수: ${r.score}/10\n잘한 점: ${r.went_well || "없음"}\n아쉬운 점: ${r.to_improve || "없음"}\n태그: ${(r.tags || []).join(", ") || "없음"}`
      )
      .join("\n---\n");

    const systemPrompt = `당신은 개인 성장 코치입니다. 사용자의 일일 회고 데이터를 분석합니다.

분석 원칙:
1. 잘한 점에 대해서는 아낌없는 칭찬을 해주세요. 구체적으로 어떤 점이 훌륭한지, 왜 그것이 성장에 기여하는지 설명하세요.
2. 못한 점과 보완할 점에 대해서는 날카롭게 지적해주세요. 단, 건설적인 비판으로 다음 행동을 명확히 제시하세요.
3. 데이터에서 패턴을 찾아 통계적으로 분석하세요 (평균 점수, 추이, 반복되는 태그 등).
4. 취약점과 장점을 명확히 구분하여 제시하세요.
5. 마지막에 실천 가능한 구체적 조언 1-2개를 제시하세요.

분석 기간: ${periodLabel}
응답 형식: 한국어로 작성. 마크다운 없이 순수 텍스트.`;

    const userMessage = `다음은 ${periodLabel} 동안의 회고 데이터입니다:\n\n${retroSummary}\n\n위 데이터를 바탕으로 종합적인 분석을 해주세요.`;

    // Call Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const analysis = result.content?.[0]?.text || "분석 결과를 생성할 수 없습니다.";

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
