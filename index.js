import * as dotenv from 'dotenv';
dotenv.config();

import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';


const PDF_PATH = './dsa.pdf';
const pdfLoader = new PDFLoader(PDF_PATH);
const rawDocs = await pdfLoader.load();
//console.log(JSON.stringify(rawDocs, null, 2));
console.log(rawDocs.length);

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;


const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });
const chunkedDocs = await textSplitter.splitDocuments(rawDocs);
//console.log(JSON.stringify(chunkedDocs.slice(0, 2), null, 2));



const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'text-embedding-004',
  });

console.log('Documents ingested successfully!');
const pinecone = new Pinecone();
const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

/*await pinecone.deleteIndex(process.env.PINECONE_INDEX_NAME);

await pinecone.createIndex({
  name: process.env.PINECONE_INDEX_NAME,
  dimension: 768,
  metric: "cosine",
  spec: {
    serverless: {
      cloud: "aws",
      region: "us-east-1",
    },
  },
});*/


//console.log(pineconeIndex);

try {
  await PineconeStore.fromDocuments(chunkedDocs, embeddings, {
    pineconeIndex,
    maxConcurrency: 5,
  });

  console.log('✅ Documents ingested successfully!');
} catch (err) {
  console.error('❌ Pinecone ingestion error:', err.message);
}

console.log('Ziaur successfully!');