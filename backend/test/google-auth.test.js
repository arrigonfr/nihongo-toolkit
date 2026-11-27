import test from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { createServiceAccountJwt, getGoogleAccessToken } from "../../scripts/google-auth.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});

const serviceAccount = {
  client_email: "indexer@example.iam.gserviceaccount.com",
  private_key: privateKey,
  token_uri: "https://oauth2.googleapis.com/token"
};

test("createServiceAccountJwt signs a verifiable RS256 JWT with expected claims", () => {
  const { jwt, tokenUri } = createServiceAccountJwt(
    serviceAccount,
    ["https://www.googleapis.com/auth/indexing"],
    1_700_000_000
  );
  assert.equal(tokenUri, "https://oauth2.googleapis.com/token");
  const [headerB64, payloadB64, signatureB64] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(headerB64, "base64url").toString()), {
    alg: "RS256",
    typ: "JWT"
  });
  assert.deepEqual(JSON.parse(Buffer.from(payloadB64, "base64url").toString()), {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/indexing",
    aud: "https://oauth2.googleapis.com/token",
    iat: 1_700_000_000,
    exp: 1_700_003_600
  });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  assert.equal(verifier.verify(publicKey, signatureB64, "base64url"), true);
});

test("getGoogleAccessToken exchanges the signed JWT for an access token and surfaces errors", async () => {
  let captured;
  const token = await getGoogleAccessToken(
    JSON.stringify(serviceAccount),
    ["https://www.googleapis.com/auth/webmasters"],
    {
      nowSeconds: 1_700_000_000,
      fetchImpl: async (url, init) => {
        captured = { url, init };
        return new Response(JSON.stringify({ access_token: "ya29.test-token" }), { status: 200 });
      }
    }
  );
  assert.equal(token, "ya29.test-token");
  assert.equal(captured.url, "https://oauth2.googleapis.com/token");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  assert.equal(captured.init.body.get("assertion").split(".").length, 3);

  await assert.rejects(
    () => getGoogleAccessToken("", ["https://www.googleapis.com/auth/indexing"]),
    /must not be null or empty/
  );
  await assert.rejects(
    () => getGoogleAccessToken(JSON.stringify(serviceAccount), ["https://www.googleapis.com/auth/indexing"], {
      fetchImpl: async () => new Response("invalid_grant", { status: 400 })
    }),
    /400.*invalid_grant/
  );
});
