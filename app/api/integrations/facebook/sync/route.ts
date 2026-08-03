import {
  loadIntegrationToken,
  requireFirebaseUser,
  updateIntegrationMetadata,
} from "../../_shared";

type GraphPage<T> = {
  data?: T[];
  paging?: { next?: string };
  error?: { code?: number; message?: string; type?: string };
};

type Business = { id: string; name: string };
type AdAccount = {
  id: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  currency?: string;
  amount_spent?: string;
  balance?: string;
  spend_cap?: string;
  business?: { id?: string; name?: string };
  periodSpend?: number;
  dailySpend?: Array<{ date: string; spend: number; impressions: number; clicks: number }>;
};

type Insight = {
  date_start?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
};

async function graphAll<T>(initialUrl: string, token: string) {
  const rows: T[] = [];
  let next: string | undefined = initialUrl;
  for (let page = 0; next && page < 10; page += 1) {
    const url = new URL(next);
    if (url.hostname !== "graph.facebook.com") throw new Error("invalid_graph_host");
    url.searchParams.set("access_token", token);
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const payload = await response.json() as GraphPage<T>;
    if (!response.ok || payload.error) {
      throw new Error(`meta_${payload.error?.code ?? response.status}`);
    }
    rows.push(...(payload.data ?? []));
    next = payload.paging?.next;
  }
  return rows;
}

export async function POST(request: Request) {
  const user = await requireFirebaseUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const token = await loadIntegrationToken(user.uid, "facebook");
  if (!token) return Response.json({ error: "facebook_not_connected" }, { status: 409 });

  const version = process.env.META_GRAPH_VERSION || "v23.0";
  try {
    const body = await request.json().catch(() => ({})) as { from?: string; to?: string };
    const today = new Date().toISOString().slice(0, 10);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(body.from ?? "") ? body.from! : today;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(body.to ?? "") ? body.to! : today;
    const businessesUrl = new URL(`https://graph.facebook.com/${version}/me/businesses`);
    businessesUrl.searchParams.set("fields", "id,name");
    businessesUrl.searchParams.set("limit", "100");

    const accountsUrl = new URL(`https://graph.facebook.com/${version}/me/adaccounts`);
    accountsUrl.searchParams.set(
      "fields",
      "id,account_id,name,account_status,currency,amount_spent,balance,spend_cap,business{id,name}",
    );
    accountsUrl.searchParams.set("limit", "100");

    const [businesses, baseAdAccounts] = await Promise.all([
      graphAll<Business>(businessesUrl.toString(), token),
      graphAll<AdAccount>(accountsUrl.toString(), token),
    ]);
    const adAccounts = await Promise.all(baseAdAccounts.map(async (account) => {
      const insightsUrl = new URL(`https://graph.facebook.com/${version}/${account.id}/insights`);
      insightsUrl.searchParams.set("fields", "date_start,spend,impressions,clicks");
      insightsUrl.searchParams.set("time_increment", "1");
      insightsUrl.searchParams.set("time_range", JSON.stringify({ since: from, until: to }));
      insightsUrl.searchParams.set("limit", "500");
      const insights = await graphAll<Insight>(insightsUrl.toString(), token);
      const dailySpend = insights.map((row) => ({
        date: row.date_start ?? "",
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
      }));
      return {
        ...account,
        periodSpend: dailySpend.reduce((sum, row) => sum + row.spend, 0),
        dailySpend,
      };
    }));
    const lastSyncedAt = Date.now();
    const metadata = { businesses, adAccounts, reportRange: { from, to }, lastSyncedAt };
    await updateIntegrationMetadata(user.uid, "facebook", metadata);
    return Response.json({
      success: true,
      businessCount: businesses.length,
      adAccountCount: adAccounts.length,
      lastSyncedAt,
    });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "meta_sync_failed";
    return Response.json({ error: code }, { status: 502 });
  }
}
