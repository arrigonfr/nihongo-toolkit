import { google } from 'googleapis';

async function runIndexing() {
  try {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey?.trim()) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY must not be null or empty.');
    }

    const auth = new google.auth.JWT({
      scopes: ['https://www.googleapis.com/auth/indexing'],
    });
    auth.fromJSON(JSON.parse(serviceAccountKey));

    const indexing = google.indexing({
      version: 'v3',
      auth,
    });

    // List the page or pages you want crawled automatically on deployment
    const targetUrl = 'https://nihongo-toolkit.pages.dev';

    console.log(`Sending indexing request for: ${targetUrl}...`);

    const response = await indexing.urlNotifications.publish({
      requestBody: {
        url: targetUrl,
        type: 'URL_UPDATED',
      },
    });

    console.log('Success! Google API Response:', response.data);
  } catch (error) {
    console.error('Indexing Failed:', error.message);
    process.exitCode = 1;
  }
}

runIndexing();
