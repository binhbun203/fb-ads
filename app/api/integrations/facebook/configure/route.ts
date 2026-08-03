import { requireFirebaseOwner, saveIntegration } from "../../_shared";

export async function POST(request: Request) {
  const owner = await requireFirebaseOwner(request);
  if (!owner) return Response.json({ error: "owner_required" }, { status: 403 });

  const body = await request.json() as { appSecret?: string };
  const appSecret = body.appSecret?.trim();
  if (!appSecret || appSecret.length < 20) {
    return Response.json({ error: "invalid_app_secret" }, { status: 400 });
  }

  await saveIntegration({
    userId: owner.uid,
    provider: "facebook_config",
    token: appSecret,
    accountName: "Meta App Secret",
    metadata: { configured: true },
  });
  return Response.json({ success: true });
}
