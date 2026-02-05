import { ingest } from '../index.js';

export default async function handler(req, res) {
  // Set JSON response header
  res.setHeader('Content-Type', 'application/json');

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      type: 'error',
      error: `Method ${req.method} not allowed`
    });
  }

  try {
    console.log('[INGEST API] Starting ingestion process...');

    // Check required env vars
    if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX_NAME) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required environment variables: PINECONE_API_KEY, PINECONE_INDEX_NAME'
      });
    }

    await ingest((msg) => {
      console.log('[INGEST API]', msg);
    });

    console.log('[INGEST API] Ingestion completed successfully');
    return res.status(200).json({
      status: 'ok',
      message: 'Ingestion completed'
    });
  } catch (err) {
    console.error('[INGEST API ERROR]', err.message || err);

    return res.status(500).json({
      status: 'error',
      message: err?.message ?? String(err),
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}
