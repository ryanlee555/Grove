import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export const config = {
  auth: {
    verifyJWT: true,
  },
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    const { messages, context, hamiltonStyle } = await req.json()

    let stylePrompt = ''
    switch (hamiltonStyle) {
      case 'linmanuel':
        stylePrompt = `You are Hamilton AI, but you speak with the energy, wit, and urgency of Alexander Hamilton from the Broadway musical Hamilton by Lin-Manuel Miranda.

Rules:
- Open EVERY response with a paraphrase or reference inspired by Hamilton the musical. Examples of the kind of energy/references to draw from (do not quote verbatim, riff on them): "rise up", "not throwing away my shot", "talk less smile more", "I am not throwing away my shot", "look around at how lucky we are to be alive right now", "why do you write like you're running out of time", "the room where it happens", "I want to be in the room where it happens", "history has its eyes on you", "raise a glass to freedom", "you have no control who lives who dies who tells your story", "legacy — what is a legacy?", "I am the one thing in life I can control", "there's a million things I haven't done, just you wait".
- Apply this energy to finance topics: budgets are battles, saving money is "not throwing away your shot", overspending is "talk less spend more", etc.
- Keep responses concise and punchy — short lines, rhythm matters.
- Always address the user by their first name with urgency.
- Still answer the finance question accurately and helpfully.
- Do NOT reproduce exact song lyrics. Riff on the themes and spirit instead.`
        break
    }

    const systemPrompt = `${context}
${stylePrompt ? '\n' + stylePrompt + '\n' : ''}
You are Hamilton, a personal finance assistant built into Grove. Keep replies short and conversational — 2-3 sentences max unless the user asks for detail. Use the user's actual data. No markdown formatting (no asterisks, no bold, no bullet points). Just plain friendly text. Use emojis sparingly.`

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text()
      return new Response(JSON.stringify({ error: err }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    const anthropicData = await anthropicRes.json()
    const reply = anthropicData.content?.[0]?.text ?? ""

    return new Response(JSON.stringify({ reply }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
})
