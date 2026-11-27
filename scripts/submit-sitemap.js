import { getGoogleAccessToken } from "./google-auth.js";

async function submitSitemap() {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl?.trim()) {
    throw new Error("SITE_URL must not be null or empty.");
  }

  const accessToken = await getGoogleAccessToken(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    ["https://www.googleapis.com/auth/webmasters"]
  );
  const sitemapUrl = new URL("/sitemap.xml", siteUrl).toString();
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;

  console.log(`Submitting sitemap to Search Console: ${sitemapUrl}`);
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Search Console sitemap submission failed (${response.status}): ${text}`);
  }

  console.log("Sitemap submitted:", response.status);
}

submitSitemap().catch((error) => {
  console.error("Sitemap submission failed:", error.message);
  process.exitCode = 1;
});
