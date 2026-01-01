import * as dotenv from "dotenv";
dotenv.config();

import readlineSync from "readline-sync";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

const required = ['OPENAI_API_KEY', 'PINECONE_INDEX_NAME', 'GEMINI_API_KEY'];
const missingEnv = required.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error('Missing required env vars:', missingEnv.join(', '));
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// chat history
const history = [];

/* -------------------------------
  Step 1: Rewrite Query (optional)
--------------------------------*/
async function transformQuery(question) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Rewrite the question for semantic search." },
        { role: "user", content: question },
      ],
    });

    return response.choices?.[0]?.message?.content ?? question;
  } catch (err) {
    console.warn('transformQuery failed, using original question:', err?.message ?? err);
    return question;
  }
}

/* -------------------------------
  Step 2: Create Embedding
--------------------------------*/
async function embedQuery(text) {
  try {
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    return embedding.data?.[0]?.embedding;
  } catch (err) {
    console.warn('OpenAI embedding failed:', err?.message ?? err);
    return null;
  }
}

/* -------------------------------
  Step 3: Chat + RAG
--------------------------------*/
async function chatting(question) {
  console.log("\nUser:", question);

  const refinedQuery = await transformQuery(question);
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'text-embedding-004',
  });

  const queryVector = await embeddings.embedQuery(refinedQuery);
  //const queryVector = await embedQuery(refinedQuery);

  // Pinecone
  const pinecone = new Pinecone();
  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);

  const searchResults = await index.query({
    vector: queryVector,
    topK: 10,
    includeMetadata: true,
  });

  if (!searchResults?.matches?.length) {
    console.log('No search matches found.');
    return;
  }

  const context = searchResults.matches
    .map(match => match.metadata.text)
    .join("\n\n---\n\n");

  // Save conversation
  history.push({ role: "user", content: question });

  // Final ChatGPT Answer
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content: `You are a Data Structure and Algorithm expert.
Answer ONLY from the context.
If not found, say: "I could not find the answer in the provided document."

Context:
${context}`,
      },
      ...history,
    ],
  });

  const answer = response.choices[0].message.content;
  history.push({ role: "assistant", content: answer });

  console.log("\nAnswer:\n", answer);
}

/* -------------------------------
  Main Loop
--------------------------------*/
async function main() {
  while (true) {
    const userProblem = readlineSync.question("\nAsk me anything--> ");
    await chatting(userProblem);
  }
}

main();
