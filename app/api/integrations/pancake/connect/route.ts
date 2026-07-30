import { requireFirebaseUser, saveIntegration } from "../../_shared";

export async function POST(request: Request) {
  const user = await requireFirebaseUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json() as { apiKey?: string };
  const apiKey = body.apiKey?.trim();
  if (!apiKey || apiKey.length < 12) return Response.json({ error: "invalid_api_key" }, { status: 400 });

  const response = await fetch(
    `https://pos.pages.fm/api/v1/shops?api_key=${encodeURIComponent(apiKey)}`,
    { headers: { accept: "application/json" } },
  );
  if (!response.ok) return Response.json({ error: "pancake_rejected" }, { status: 400 });
  const data = await response.json() as { success?: boolean; shops?: Array<{ id: number; name: string; pages?: unknown[] }> };
  if (!data.success || !data.shops?.length) {
    return Response.json({ error: "pancake_rejected" }, { status: 400 });
  }
  await saveIntegration({
    userId: user.uid,
    provider: "pancake",
    token: apiKey,
    accountName: data.shops[0].name,
    externalAccountId: String(data.shops[0].id),
    metadata: { shops: data.shops.map((shop) => ({ id: shop.id, name: shop.name, pageCount: shop.pages?.length ?? 0 })) },
  });
  return Response.json({ success: true, shops: data.shops.map((shop) => ({ id: shop.id, name: shop.name })) });
}
