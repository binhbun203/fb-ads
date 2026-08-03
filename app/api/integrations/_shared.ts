import { env } from "cloudflare:workers";

type FirebaseAccount = { localId?: string; email?: string };

export async function requireFirebaseUser(request: Request) {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!token || !apiKey) return null;

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    },
  );
  if (!response.ok) return null;
  const data = await response.json() as { users?: FirebaseAccount[] };
  const user = data.users?.[0];
  return user?.localId ? { uid: user.localId, email: user.email ?? "" } : null;
}

export async function requireFirebaseOwner(request: Request) {
  const user = await requireFirebaseUser(request);
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!user || !token || !projectId) return null;

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/admins/${encodeURIComponent(user.uid)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return null;
  const profile = await response.json() as {
    fields?: {
      role?: { stringValue?: string };
      active?: { booleanValue?: boolean };
    };
  };
  return profile.fields?.role?.stringValue === "owner" &&
    profile.fields?.active?.booleanValue === true
    ? user
    : null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const source = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!source || source.length < 32) throw new Error("Missing encryption key");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return { encryptedToken: bytesToBase64(new Uint8Array(encrypted)), tokenIv: bytesToBase64(iv) };
}

export async function decryptToken(value: string, iv: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    await encryptionKey(),
    base64ToBytes(value),
  );
  return new TextDecoder().decode(decrypted);
}

export async function signState(payload: { uid: string; returnTo: string; expires: number }) {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret || secret.length < 24) throw new Error("Missing OAuth state secret");
  const body = bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${bytesToBase64(new Uint8Array(signature))}`;
}

export async function verifyState(value: string) {
  const [body, signature] = value.split(".");
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!body || !signature || !secret) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64ToBytes(signature),
    new TextEncoder().encode(body),
  );
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(base64ToBytes(body))) as {
    uid: string;
    returnTo: string;
    expires: number;
  };
  return payload.expires > Date.now() ? payload : null;
}

export async function ensureIntegrationTable() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      encrypted_token TEXT NOT NULL,
      token_iv TEXT NOT NULL,
      token_expires_at INTEGER,
      account_name TEXT,
      external_account_id TEXT,
      metadata TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS integrations_user_provider_idx ON integrations(user_id, provider)"),
  ]);
}

export async function saveIntegration(input: {
  userId: string;
  provider: string;
  token: string;
  expiresAt?: number | null;
  accountName?: string;
  externalAccountId?: string;
  metadata?: unknown;
}) {
  await ensureIntegrationTable();
  const encrypted = await encryptToken(input.token);
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO integrations
    (id, user_id, provider, encrypted_token, token_iv, token_expires_at, account_name, external_account_id, metadata, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET
      encrypted_token = excluded.encrypted_token,
      token_iv = excluded.token_iv,
      token_expires_at = excluded.token_expires_at,
      account_name = excluded.account_name,
      external_account_id = excluded.external_account_id,
      metadata = excluded.metadata,
      status = 'active',
      updated_at = excluded.updated_at`)
    .bind(
      `${input.userId}:${input.provider}`,
      input.userId,
      input.provider,
      encrypted.encryptedToken,
      encrypted.tokenIv,
      input.expiresAt ?? null,
      input.accountName ?? null,
      input.externalAccountId ?? null,
      JSON.stringify(input.metadata ?? {}),
      now,
      now,
    ).run();
}

export async function loadIntegrationToken(userId: string, provider: string) {
  await ensureIntegrationTable();
  const row = await env.DB.prepare(
    "SELECT encrypted_token, token_iv FROM integrations WHERE user_id = ? AND provider = ? AND status = 'active'",
  ).bind(userId, provider).first<{ encrypted_token: string; token_iv: string }>();
  if (!row) return null;
  return decryptToken(row.encrypted_token, row.token_iv);
}

export async function loadIntegrationMetadata<T = Record<string, unknown>>(
  userId: string,
  provider: string,
) {
  await ensureIntegrationTable();
  const row = await env.DB.prepare(
    "SELECT metadata FROM integrations WHERE user_id = ? AND provider = ? AND status = 'active'",
  ).bind(userId, provider).first<{ metadata: string | null }>();
  if (!row?.metadata) return null;
  try {
    return JSON.parse(row.metadata) as T;
  } catch {
    return null;
  }
}

export async function updateIntegrationMetadata(
  userId: string,
  provider: string,
  metadata: unknown,
) {
  await ensureIntegrationTable();
  await env.DB.prepare(
    "UPDATE integrations SET metadata = ?, updated_at = ?, status = 'active' WHERE user_id = ? AND provider = ?",
  ).bind(JSON.stringify(metadata), Date.now(), userId, provider).run();
}
