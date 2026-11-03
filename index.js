import { google } from 'googleapis';

const auth = new google.auth.GoogleAuth({
  keyFile: './service_account.json',
  scopes: ['https://googleapis.com'],
});

const indexing = google.indexing({
  version: 'v3',
  auth: auth
});

async function runIndexing() {
  try {
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
  }
}

runIndexing();
