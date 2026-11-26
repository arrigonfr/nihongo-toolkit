import { getGoogleAccessToken } from "./scripts/google-auth.js";

async function runIndexing() {
  try {
    const accessToken = await getGoogleAccessToken(
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      ["https://www.googleapis.com/auth/indexing"]
    );

    // List the page or pages you want crawled automatically on deployment
    const targetUrl = "https://nihongotoolkit.pages.dev";

    console.log(`Sending indexing request for: ${targetUrl}...`);

    const response = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: targetUrl,
        type: "URL_UPDATED"
      })
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Google Indexing API failed (${response.status}): ${text}`);
    }

    console.log("Success! Google API Response:", text ? JSON.parse(text) : {});
  } catch (error) {
    console.error("Indexing Failed:", error.message);
    process.exitCode = 1;
  }
}

runIndexing();
