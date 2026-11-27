import { createSign } from "node:crypto";

const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

export function createServiceAccountJwt(credentials, scopes, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!credentials?.client_email || !credentials?.private_key) {
    throw new Error("Service account JSON must include client_email and private_key.");
  }
  const tokenUri = credentials.token_uri || DEFAULT_TOKEN_URI;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: Array.isArray(scopes) ? scopes.join(" ") : String(scopes),
    aud: tokenUri,
    iat: nowSeconds,
    exp: nowSeconds + 3600
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(credentials.private_key, "base64url");
  return { jwt: `${unsigned}.${signature}`, tokenUri };
}

export async function getGoogleAccessToken(serviceAccountKey, scopes, { fetchImpl = fetch, nowSeconds } = {}) {
  if (!serviceAccountKey?.trim()) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY must not be null or empty.");
  }
  const credentials = JSON.parse(serviceAccountKey);
  const { jwt, tokenUri } = createServiceAccountJwt(credentials, scopes, nowSeconds);
  const response = await fetchImpl(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Google OAuth token request failed (${response.status}): ${text}`);
  }
  const data = JSON.parse(text);
  if (!data.access_token) {
    throw new Error("Google OAuth token response did not include an access_token.");
  }
  return data.access_token;
}
