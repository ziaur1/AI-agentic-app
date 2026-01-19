import express from 'express';
import { ingest } from './index.js';
import { chatting } from './query.js'; 
import OpenAI from 'openai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Pinecone } from '@pinecone-database/pinecone';

const app = express();
app.use(express.static('public'));
app.use(express.json());

app.post('/api/ingest', async (req, res) => {
  try {
    await ingest((msg) => {
      console.log(msg);
    });
    res.json({ status: 'ok', message: 'Ingestion completed' });
  } catch (err) {
    console.error('Ingest error:', err);
    res.status(500).json({ status: 'error', message: err?.message ?? String(err) });
  }
});

async function answerQuery(question) {
  if (!process.env.OPENAI_API_KEY || !process.env.GEMINI_API_KEY || !process.env.PINECONE_INDEX_NAME) {
    throw new Error('Missing OPENAI_API_KEY, GEMINI_API_KEY, or PINECONE_INDEX_NAME env vars');
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // optional: rewrite the query for better semantic search
  let refined = question;
  try {
    const rewrite = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Rewrite the question for semantic search.' },
        { role: 'user', content: question },
      ],
    });
    refined = rewrite.choices?.[0]?.message?.content ?? question;
  } catch (err) {
    console.warn('Query rewrite failed, using original question:', err?.message ?? err);
  }

  // embed using Google/Gemini embeddings
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'text-embedding-004',
  });
  const queryVector = await embeddings.embedQuery(refined);

  const pinecone = new Pinecone();
  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);

  const searchResults = await index.query({
    vector: queryVector,
    topK: 6,
    includeMetadata: true,
  });

  const matches = (searchResults.matches ?? []).map((m) => ({score: m.score, metadata: m.metadata}));
  const context = matches.map(m => m.metadata?.text ?? '').join('\n\n---\n\n');

  const systemPrompt = `You are a helpful assistant. Answer using ONLY the context below. If the answer cannot be found, reply: "I could not find the answer in the provided document."\n\nContext:\n${context}`;

  const chatResp = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
  });

  const answer = chatResp.choices?.[0]?.message?.content ?? 'No answer generated.';
  return { answer, matches };
}


app.post("/api/chat", async (req, res) => {
  try {
    const result = await chatting(req.body.message);

    if (!result) {
      // 👈 SAFETY NET
      return res.status(200).json({
        type: "empty",
        answer: "No response generated"
      });
    }

    res.status(200).json(result);

  } catch (err) {
    console.error("API Error:", err);

    res.status(500).json({
      type: "error",
      message: err.message || "Internal Server Error"
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
