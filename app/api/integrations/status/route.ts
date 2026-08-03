import { env } from "cloudflare:workers";
import { ensureIntegrationTable, requireFirebaseUser } from "../_shared";

export async function GET(request: Request) {
  const user = await requireFirebaseUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureIntegrationTable();
  const result = await env.DB.prepare(
    "SELECT provider, account_name, external_account_id, metadata, status, updated_at FROM integrations WHERE user_id = ? AND provider != 'facebook_config'",
  ).bind(user.uid).all();
  return Response.json({
    connections: result.results.map((row) => ({
      provider: row.provider,
      accountName: row.account_name,
      externalAccountId: row.external_account_id,
      metadata: row.metadata ? JSON.parse(String(row.metadata)) : {},
      status: row.status,
      updatedAt: row.updated_at,
    })),
  });
}
