import { chatting } from '../query.js';

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
    const message = req.body?.message;

    console.log('[CHAT API] Received message:', message?.substring(0, 50));

    // Validate input
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        type: 'error',
        answer: 'No message provided',
        error: 'Message is required and must be a string'
      });
    }

    // Check required env vars
    const requiredVars = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'PINECONE_INDEX_NAME', 'PINECONE_API_KEY'];
    const missingVars = requiredVars.filter(v => !process.env[v]);

    if (missingVars.length > 0) {
      console.error('[CHAT API] Missing env vars:', missingVars);
      return res.status(500).json({
        type: 'error',
        answer: 'Server configuration error',
        error: `Missing environment variables: ${missingVars.join(', ')}`
      });
    }

    console.log('[CHAT API] Calling chatting function...');
    const result = await chatting(message);

    if (!result) {
      console.warn('[CHAT API] No result from chatting function');
      return res.status(200).json({
        type: 'empty',
        answer: 'No response generated'
      });
    }

    console.log('[CHAT API] Response generated successfully');
    return res.status(200).json(result);
  } catch (err) {
    console.error('[CHAT API ERROR]', err.message || err);

    return res.status(500).json({
      type: 'error',
      answer: 'Error processing your request',
      error: err.message || 'Internal Server Error',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}
