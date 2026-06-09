/**
 * Authoritative cost/usage from Cloudflare AI Gateway. Every LLM call (Workers
 * AI + OpenRouter) routes through the `talmud` gateway, and CF reports
 * provider-side cost + token counts in its analytics dataset
 * (`aiGatewayRequestsAdaptiveGroups`). That number is authoritative — it covers
 * models we don't price in-app (Workers AI) and reflects prompt-cache savings.
 *
 * Requires a Cloudflare API token with "Account Analytics: Read". Set it as a
 * secret:  wrangler secret put CF_ANALYTICS_TOKEN
 * The account id + gateway id come from existing bindings/vars.
 *
 * Degrades gracefully: if the token is missing or the query fails, returns a
 * { configured/ok: false, error } shape so the dashboard can say so plainly
 * instead of showing a fabricated total.
 *
 * NOTE: the GraphQL field/filter names below follow CF's documented AI Gateway
 * analytics schema; if Cloudflare renames a field the query will error and the
 * dashboard surfaces that error string verbatim for diagnosis.
 */

export interface AigwModelRow {
  model: string;
  provider?: string;
  requests: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

export interface AigwCost {
  configured: boolean; // do we have a token + account/gateway ids
  ok: boolean; // did the query succeed
  error?: string;
  windowStart?: string;
  windowEnd?: string;
  requests?: number;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  byModel?: AigwModelRow[];
}

interface AigwEnv {
  CLOUDFLARE_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
}

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

const QUERY = `
query GatewayUsage($accountTag: string!, $gateway: string!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      aiGatewayRequestsAdaptiveGroups(
        limit: 1000
        filter: { gateway: $gateway, datetime_geq: $start, datetime_leq: $end }
      ) {
        count
        sum { cost cachedTokensIn cachedTokensOut uncachedTokensIn uncachedTokensOut }
        dimensions { model provider }
      }
    }
  }
}`;

interface GraphQLGroup {
  count?: number;
  // Token sums are split cached/uncached in the AI Gateway dataset; we add the
  // two halves to report total in/out. There is no plain tokensIn/tokensOut sum.
  sum?: {
    cost?: number;
    cachedTokensIn?: number;
    cachedTokensOut?: number;
    uncachedTokensIn?: number;
    uncachedTokensOut?: number;
  };
  dimensions?: { model?: string; provider?: string };
}

export async function fetchGatewayCost(env: AigwEnv, days = 30): Promise<AigwCost> {
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const gateway = env.AI_GATEWAY_ID;
  const token = env.CF_ANALYTICS_TOKEN;
  if (!token || !account || !gateway) {
    const missing = [
      !token && 'CF_ANALYTICS_TOKEN',
      !account && 'CLOUDFLARE_ACCOUNT_ID',
      !gateway && 'AI_GATEWAY_ID',
    ]
      .filter(Boolean)
      .join(', ');
    return { configured: false, ok: false, error: `not configured (missing: ${missing})` };
  }

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const variables = {
    accountTag: account,
    gateway,
    start: start.toISOString(),
    end: end.toISOString(),
  };

  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: QUERY, variables }),
    });
    if (!res.ok) {
      return { configured: true, ok: false, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      data?: {
        viewer?: { accounts?: Array<{ aiGatewayRequestsAdaptiveGroups?: GraphQLGroup[] }> };
      };
      errors?: Array<{ message?: string }>;
    };
    if (json.errors && json.errors.length > 0) {
      return {
        configured: true,
        ok: false,
        error: json.errors
          .map((e) => e.message)
          .filter(Boolean)
          .join('; ')
          .slice(0, 300),
      };
    }
    const groups = json.data?.viewer?.accounts?.[0]?.aiGatewayRequestsAdaptiveGroups ?? [];
    let requests = 0;
    let costUsd = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    const byModelMap = new Map<string, AigwModelRow>();
    for (const g of groups) {
      const c = g.count ?? 0;
      const cost = g.sum?.cost ?? 0;
      const tin = (g.sum?.cachedTokensIn ?? 0) + (g.sum?.uncachedTokensIn ?? 0);
      const tout = (g.sum?.cachedTokensOut ?? 0) + (g.sum?.uncachedTokensOut ?? 0);
      requests += c;
      costUsd += cost;
      tokensIn += tin;
      tokensOut += tout;
      const model = g.dimensions?.model ?? '(unknown)';
      const row = byModelMap.get(model) ?? {
        model,
        provider: g.dimensions?.provider,
        requests: 0,
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
      };
      row.requests += c;
      row.costUsd += cost;
      row.tokensIn += tin;
      row.tokensOut += tout;
      byModelMap.set(model, row);
    }
    const byModel = [...byModelMap.values()].sort((a, b) => b.costUsd - a.costUsd);
    return {
      configured: true,
      ok: true,
      windowStart: variables.start,
      windowEnd: variables.end,
      requests,
      costUsd,
      tokensIn,
      tokensOut,
      byModel,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: String((err as Error)?.message ?? err).slice(0, 300),
    };
  }
}
