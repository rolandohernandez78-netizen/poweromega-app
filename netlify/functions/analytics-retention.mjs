import { getStore } from '@netlify/blobs';

const STORE_NAME = 'poweromega-analytics-v1';
const RETENTION_DAYS = 400;

export default async function handler() {
  const threshold = new Date(Date.now() - RETENTION_DAYS * 86400000);
  const store = getStore(STORE_NAME);
  let deleted = 0;

  for await (const page of store.list({ prefix: 'events/', paginate: true })) {
    for (const blob of page.blobs) {
      const datePart = blob.key.split('/')[1];
      const day = new Date(`${datePart}T00:00:00.000Z`);
      if (Number.isFinite(day.getTime()) && day < threshold) {
        await store.delete(blob.key);
        deleted += 1;
      }
    }
  }

  console.log(`PowerOmega analytics: ${deleted} registros vencidos eliminados.`);
}

export const config = {
  schedule: '@monthly'
};
