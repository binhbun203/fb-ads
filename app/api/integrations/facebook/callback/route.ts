import { saveIntegration, verifyState } from "../../_shared";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const destination = new URL("/", url.origin);
  if (error || !code || !state) {
    destination.searchParams.set("connection", "facebook-cancelled");
    return Response.redirect(destination);
  }
  const payload = await verifyState(state);
  if (!payload) {
    destination.searchParams.set("connection", "facebook-invalid");
    return Response.redirect(destination);
  }
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    destination.searchParams.set("connection", "facebook-config");
    return Response.redirect(destination);
  }
  const version = process.env.META_GRAPH_VERSION || "v23.0";
  const redirectUri = `${url.origin}/api/integrations/facebook/callback`;
  const tokenUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
  tokenUrl.search = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  }).toString();
  const tokenResponse = await fetch(tokenUrl);
  if (!tokenResponse.ok) {
    destination.searchParams.set("connection", "facebook-error");
    return Response.redirect(destination);
  }
  const tokenData = await tokenResponse.json() as { access_token: string; expires_in?: number };
  const profileResponse = await fetch(
    `https://graph.facebook.com/${version}/me?fields=id,name&access_token=${encodeURIComponent(tokenData.access_token)}`,
  );
  const profile = profileResponse.ok
    ? await profileResponse.json() as { id?: string; name?: string }
    : {};
  await saveIntegration({
    userId: payload.uid,
    provider: "facebook",
    token: tokenData.access_token,
    expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
    accountName: profile.name ?? "Facebook Business",
    externalAccountId: profile.id,
  });
  destination.searchParams.set("connection", "facebook-success");
  return Response.redirect(destination);
}
