import * as dotenv from 'dotenv';
dotenv.config();

import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';

async function main() {
  const required = ['GEMINI_API_KEY', 'PINECONE_INDEX_NAME'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('Missing required env vars:', missing.join(', '));
    process.exit(1);
  }

  const PDF_PATH = './dsa.pdf';
  const pdfLoader = new PDFLoader(PDF_PATH);
  let rawDocs;
  try {
    rawDocs = await pdfLoader.load();
  } catch (err) {
    console.error('Failed to load PDF:', err?.message ?? err);
    process.exit(1);
  }

  console.log('Loaded documents:', rawDocs.length);

  const CHUNK_SIZE = 1000;
  const CHUNK_OVERLAP = 200;

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });
  const chunkedDocs = await textSplitter.splitDocuments(rawDocs);

  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'text-embedding-004',
  });

  try {
    const pinecone = new Pinecone();
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

    await PineconeStore.fromDocuments(chunkedDocs, embeddings, {
      pineconeIndex,
      maxConcurrency: 5,
    });

    console.log('✅ Documents ingested successfully!');
  } catch (err) {
    console.error('❌ Pinecone ingestion error:', err?.message ?? err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err?.message ?? err);
  process.exit(1);
});