import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export const config = {
  auth: {
    verifyJWT: false,
  },
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]
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

    // Fetch ALL token rows for this user (one per bank)
    const { data: tokenRows, error: tokenError } = await supabase
      .from("plaid_tokens")
      .select("access_token, institution_name")
      .eq("user_id", user.id)

    if (tokenError || !tokenRows || tokenRows.length === 0) {
      return new Response(JSON.stringify({ error: "No linked bank account found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    // Build date range: last 365 days
    const today = new Date()
    const oneYearAgo = new Date()
    oneYearAgo.setDate(today.getDate() - 365)

    // Fetch transactions from each bank and combine
    const allTransactions = []

    for (const tokenRow of tokenRows) {
      // Paginate through all transactions
      let allBankTransactions: any[] = []
      let offset = 0
      const count = 500

      while (true) {
        const plaidRes = await fetch("https://production.plaid.com/transactions/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: Deno.env.get("PLAID_CLIENT_ID"),
            secret: Deno.env.get("PLAID_PRODUCTION_SECRET"),
            access_token: tokenRow.access_token,
            start_date: formatDate(oneYearAgo),
            end_date: formatDate(today),
            options: { count, offset },
          }),
        })

        const plaidData = await plaidRes.json()

        if (!plaidRes.ok) {
          console.error(`Plaid error for ${tokenRow.institution_name}:`, plaidData)
          break
        }

        allBankTransactions.push(...plaidData.transactions)

        if (allBankTransactions.length >= plaidData.total_transactions) break
        offset += count
      }

      const tagged = allBankTransactions.map((t: any) => ({
        ...t,
        institution_name: tokenRow.institution_name,
      }))

      allTransactions.push(...tagged)
    }

    // Sort combined transactions by date descending
    allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return new Response(JSON.stringify({ transactions: allTransactions }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
})