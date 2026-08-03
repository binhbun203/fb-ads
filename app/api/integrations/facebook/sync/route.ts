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
    const businessesUrl = new URL(`https://graph.facebook.com/${version}/me/businesses`);
    businessesUrl.searchParams.set("fields", "id,name");
    businessesUrl.searchParams.set("limit", "100");

    const accountsUrl = new URL(`https://graph.facebook.com/${version}/me/adaccounts`);
    accountsUrl.searchParams.set(
      "fields",
      "id,account_id,name,account_status,currency,amount_spent,balance,spend_cap,business{id,name}",
    );
    accountsUrl.searchParams.set("limit", "100");

    const [businesses, adAccounts] = await Promise.all([
      graphAll<Business>(businessesUrl.toString(), token),
      graphAll<AdAccount>(accountsUrl.toString(), token),
    ]);
    const lastSyncedAt = Date.now();
    const metadata = { businesses, adAccounts, lastSyncedAt };
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
