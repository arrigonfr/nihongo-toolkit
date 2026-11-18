import { google } from 'googleapis';

async function submitSitemap() {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey?.trim()) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY must not be null or empty.');
  }

  const siteUrl = process.env.SITE_URL;
  if (!siteUrl?.trim()) {
    throw new Error('SITE_URL must not be null or empty.');
  }

  const auth = new google.auth.JWT({
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });
  auth.fromJSON(JSON.parse(serviceAccountKey));

  const searchConsole = google.webmasters({
    version: 'v3',
    auth,
  });
  const sitemapUrl = new URL('/sitemap.xml', siteUrl).toString();

  console.log(`Submitting sitemap to Search Console: ${sitemapUrl}`);
  const response = await searchConsole.sitemaps.submit({
    siteUrl,
    feedpath: sitemapUrl,
  });

  console.log('Sitemap submitted:', response.status);
}

submitSitemap().catch((error) => {
  console.error('Sitemap submission failed:', error.message);
  process.exitCode = 1;
});
