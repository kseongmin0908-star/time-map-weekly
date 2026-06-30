// Supabase Edge Function: Claude AI Analysis Proxy (v2 — enriched payload)
// Keeps the Claude API key server-side (set via: supabase secrets set CLAUDE_API_KEY=sk-ant-...)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // ── Require an authenticated Supabase user ──
    // 공개 anon 키만으로 호출해 Claude 크레딧을 남용하는 것을 차단한다.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return new Response(
        JSON.stringify({ error: "인증이 필요합니다. 로그인 후 다시 시도해주세요." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "인증 실패. 로그인 상태를 확인해주세요." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY");
    if (!CLAUDE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "CLAUDE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();

    // ── 대화(답글) 모드: AI 분석 댓글에 사용자가 의견을 달면 코치로서 이어서 답변 ──
    if (body && body.reply) {
      const { analysis, messages } = body.reply;
      const chatSystem = `당신은 개인 성장 코치입니다. 이전에 사용자에게 다음과 같은 분석/조언을 제공했습니다:

"""
${String(analysis || "").slice(0, 4000)}
"""

이제 사용자가 그 분석에 대해 의견이나 질문을 남겼습니다. 코치로서 대화를 이어가세요.
원칙:
1. 사용자의 의견에서 공감·동의할 부분은 진심으로 인정하세요.
2. 잘못된 인식, 합리화, 회피가 보이면 날카롭게 짚되 건설적으로.
3. 추상적 위로 대신, 바로 실천할 수 있는 구체적 제안으로 이어가세요.
4. 대화체로 너무 길지 않게(2~4문단). 마크다운 없이 순수 텍스트, 한국어.`;

      // 메시지 정리 + 연속 동일 role 병합 (Claude는 user로 시작/끝나는 교차 구조 선호)
      const raw = (messages || [])
        .filter((m: any) => m && m.content)
        .map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content) }));
      const chatMessages: any[] = [];
      for (const m of raw) {
        const last = chatMessages[chatMessages.length - 1];
        if (last && last.role === m.role) last.content += "\n\n" + m.content;
        else chatMessages.push({ role: m.role, content: m.content });
      }
      if (chatMessages.length === 0 || chatMessages[0].role !== "user" || chatMessages[chatMessages.length - 1].role !== "user") {
        return new Response(
          JSON.stringify({ error: "대화 메시지 구조가 올바르지 않습니다." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const chatRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": CLAUDE_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4096, system: chatSystem, messages: chatMessages }),
      });
      if (!chatRes.ok) {
        const t = await chatRes.text();
        throw new Error(`Claude API error: ${chatRes.status} - ${t}`);
      }
      const chatJson = await chatRes.json();
      const reply = chatJson.content?.[0]?.text || "응답을 생성할 수 없습니다.";
      return new Response(
        JSON.stringify({ reply }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      retros,
      dailyGoals,
      weeklyGoals,
      pomodoro,
      unconscious,
      patterns,
      period,
    } = body;

    if ((!retros || retros.length === 0) && (!dailyGoals || dailyGoals.length === 0)) {
      return new Response(
        JSON.stringify({ analysis: "분석할 데이터가 없습니다." }),
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

    // ── Format retros ──
    const retroSummary = (retros || [])
      .map(
        (r: any) =>
          `[${r.date}] 점수: ${r.score}/10\n잘한 점: ${r.went_well || "없음"}\n아쉬운 점: ${r.to_improve || "없음"}\n태그: ${(r.tags || []).join(", ") || "없음"}`
      )
      .join("\n---\n");

    // ── Format daily goals ──
    const dailySummary = (dailyGoals || [])
      .map((d: any) => {
        const tasks = d.tasks || [];
        const done = tasks.filter((t: any) => t.completed).length;
        const taskList = tasks
          .map((t: any) => `  ${t.completed ? "✅" : "☐"} ${t.text}`)
          .join("\n");
        return `[${d.date}] 달성률: ${done}/${tasks.length}\n${taskList}`;
      })
      .join("\n---\n");

    // ── Format weekly goals ──
    const weeklySummary = (weeklyGoals || [])
      .map((w: any) => {
        const tasks = w.tasks || [];
        const done = tasks.filter((t: any) => t.completed).length;
        const taskList = tasks
          .map((t: any) => `  ${t.completed ? "✅" : "☐"} ${t.text}`)
          .join("\n");
        return `[W${w.week}] 달성률: ${done}/${tasks.length}\n${taskList}`;
      })
      .join("\n---\n");

    // ── Format pomodoro ──
    let pomoSummary = "";
    if (pomodoro && pomodoro.totalSessions > 0) {
      pomoSummary = `총 세션: ${pomodoro.totalSessions}회\n총 집중 시간: ${pomodoro.totalMinutes}분\n일평균 세션: ${pomodoro.avgPerDay || "N/A"}회`;
    }

    // ── Format unconscious patterns ──
    const unconsciousSummary = (unconscious || [])
      .map(
        (u: any) =>
          `패턴: ${u.from_pattern || u.pattern || "?"}\n트리거: ${u.trigger || "?"}\n단계: ${u.stage || "?"}\n메모: ${u.notes || u.memo || "없음"}`
      )
      .join("\n---\n");

    // ── Format repeated failure patterns ──
    const patternSummary = (patterns || [])
      .map(
        (p: any) =>
          `목표: ${p.text}\n미완료 횟수: ${p.count}회`
      )
      .join("\n");

    // ── Build data sections ──
    const dataSections: string[] = [];
    if (retroSummary) dataSections.push(`## 일일 회고\n${retroSummary}`);
    if (dailySummary) dataSections.push(`## 일일 목표\n${dailySummary}`);
    if (weeklySummary) dataSections.push(`## 주간 목표\n${weeklySummary}`);
    if (pomoSummary) dataSections.push(`## 뽀모도로 (집중 시간)\n${pomoSummary}`);
    if (unconsciousSummary) dataSections.push(`## 무의식 패턴\n${unconsciousSummary}`);
    if (patternSummary) dataSections.push(`## 반복 실패 목표\n${patternSummary}`);

    const systemPrompt = `당신은 개인 성장 코치입니다. 사용자의 다양한 자기관리 데이터를 종합 분석합니다.

분석 원칙:
1. 잘한 점에 대해서는 아낌없는 칭찬을 해주세요. 구체적으로 어떤 점이 훌륭한지, 왜 그것이 성장에 기여하는지 설명하세요.
2. 못한 점과 보완할 점에 대해서는 날카롭게 지적해주세요. 단, 건설적인 비판으로 다음 행동을 명확히 제시하세요.
3. 데이터에서 패턴을 찾아 통계적으로 분석하세요 (평균 점수, 추이, 반복되는 태그 등).
4. 취약점과 장점을 명확히 구분하여 제시하세요.
5. 목표 달성률과 회고 점수 사이의 상관관계를 분석하세요.
6. 반복적으로 실패하는 목표가 있다면 그 원인을 추론하고, 무의식 패턴과의 연결점을 찾아주세요.
7. 뽀모도로(집중 시간) 데이터가 있다면, 집중력과 성과의 관계를 분석하세요.
8. 무의식 패턴 데이터가 있다면, 행동 패턴과의 연결고리를 찾아 깊은 인사이트를 제공하세요.
9. 마지막에 실천 가능한 구체적 조언 2-3개를 제시하세요.

분석 기간: ${periodLabel}
응답 형식: 한국어로 작성. 마크다운 없이 순수 텍스트. 분석 결과는 깊이 있고 구체적으로 작성하세요.`;

    const userMessage = `다음은 ${periodLabel} 동안의 종합 데이터입니다:\n\n${dataSections.join("\n\n")}\n\n위 데이터를 바탕으로 종합적인 분석을 해주세요. 모든 데이터 간의 연결고리를 찾고, 숨겨진 패턴과 개선 방향을 제시해주세요.`;

    // Call Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
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
