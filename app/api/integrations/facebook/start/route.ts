import { requireFirebaseUser, signState } from "../../_shared";

export async function POST(request: Request) {
  const user = await requireFirebaseUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const appId = process.env.META_APP_ID;
  if (!appId) return Response.json({ error: "meta_not_configured" }, { status: 503 });

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/integrations/facebook/callback`;
  const state = await signState({ uid: user.uid, returnTo: "/", expires: Date.now() + 10 * 60_000 });
  const version = process.env.META_GRAPH_VERSION || "v23.0";
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: "business_management,ads_read",
  });
  return Response.json({ url: `https://www.facebook.com/${version}/dialog/oauth?${params}` });
}
