import * as dotenv from 'dotenv';
dotenv.config();

import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';

export async function ingest(logger) {
  const info = (...args) => {
    if (logger) logger(args.join(' '));
    else console.log(...args);
  };
  const error = (...args) => {
    if (logger) logger('ERROR: ' + args.join(' '));
    else console.error(...args);
  };

  const required = ['GEMINI_API_KEY', 'PINECONE_INDEX_NAME'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    const msg = 'Missing required env vars: ' + missing.join(', ');
    error(msg);
    throw new Error(msg);
  }

  const PDF_PATH = './dsa.pdf';
  const pdfLoader = new PDFLoader(PDF_PATH);
  let rawDocs;
  try {
    rawDocs = await pdfLoader.load();
  } catch (err) {
    error('Failed to load PDF:', err?.message ?? err);
    throw err;
  }

  info('Loaded documents:', rawDocs.length);

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

    info('✅ Documents ingested successfully!');
  } catch (err) {
    error('❌ Pinecone ingestion error:', err?.message ?? err);
    throw err;
  }
}