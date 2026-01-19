import 'dotenv/config';
//import readlineSync from "readline-sync";
import axios from "axios";
// LangChain / AI
import { ChatOpenAI } from "@langchain/openai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
// LangSmith
import { traceable } from "langsmith/traceable";
import { RunTree } from "langsmith";
/* --------------------------------
  ENV VALIDATION
-------------------------------- */
const required = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "PINECONE_API_KEY",
  "PINECONE_INDEX_NAME",
  "LANGSMITH_API_KEY",
  "MAGENTO_BASE_URL",
  "MAGENTO_ADMIN_TOKEN"
];

const missingEnv = required.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error("Missing env vars:", missingEnv.join(", "));
  process.exit(1);
}

/* --------------------------------
  LLM
-------------------------------- */
const llm = new ChatOpenAI({
  model: "gpt-3.5-turbo",
  apiKey: process.env.OPENAI_API_KEY,
});

/* --------------------------------
  Chat History
-------------------------------- */
const history = [];

/* --------------------------------
  Magento Order Status (Tracked Tool)
-------------------------------- */
const getMagentoOrderStatus = traceable(
  async function getMagentoOrderStatus(orderNumber) {
    const url = `${process.env.MAGENTO_BASE_URL}rest/V1/orders`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.MAGENTO_ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      params: {
        "searchCriteria[filterGroups][0][filters][0][field]": "increment_id",
        "searchCriteria[filterGroups][0][filters][0][value]": orderNumber,
        "searchCriteria[filterGroups][0][filters][0][conditionType]": "eq",
      },
    });

    const order = response.data.items?.[0];
    if (!order) return { found: false };

    return {
      found: true,
      status: order.status,
      total: order.grand_total,
      created_at: order.created_at,
    };
  },
  { name: "magento-order-status" }
);

/* --------------------------------
  Rewrite Query (Tracked)
-------------------------------- */
const transformQuery = traceable(
  async function transformQuery(question) {
    const res = await llm.invoke(
      `Rewrite the following question for semantic search:\n${question}`
    );
    return typeof res.content === "string"
      ? res.content
      : res.content?.[0]?.text || question;
  },
  { name: "rewrite-query" }
);

/* --------------------------------
  Order Extraction Helpers
-------------------------------- */
function extractOrderRegex(input) {
  const match = input.match(/[o0]rder\s*#?\s*(\d+)/i);
  return match?.[1] ?? null;
}

async function extractOrderWithLLM(question) {
  const prompt = `
Extract the Magento order number from the text below.
Return ONLY the number, nothing else.
If not found, return "NONE".

Text:
"${question}"
`;

  const res = await llm.invoke(prompt);

  const text =
    typeof res.content === "string"
      ? res.content
      : res.content?.[0]?.text || "";

  // validate only digits
  if (!/^\d+$/.test(text.trim()) || text.trim() === "NONE") return null;
  return text.trim();
}

function normalizeOrderNumber(order) {
  return order?.padStart(9, "0"); // Magento increment_id standard
}

/* --------------------------------
  Main Chat Function (Tracked)
-------------------------------- */
const chatting = traceable(
  async function chatting(question) {
    console.log("\nUser:", question);

    /* --------------------------------
      1️⃣ Detect Order Status Intent
    -------------------------------- */
    let orderNumber = extractOrderRegex(question); // first try regex

    if (!orderNumber) {
      // fallback to LLM extraction
      orderNumber = await extractOrderWithLLM(question);
    }

    if (orderNumber) {
      orderNumber = normalizeOrderNumber(orderNumber);
      console.log("DEBUG: Extracted order number =", orderNumber);

      const orderData = await getMagentoOrderStatus(orderNumber);

      if (!orderData.found) {
        console.log(`\nAnswer:\nOrder #${orderNumber} was not found.`);
         return {
          type: "order_status",
          answer
        };
      }



      console.log(`
Answer:
Order #${orderNumber}
Status: ${orderData.status}
Order Date: ${orderData.created_at}
Total: $${orderData.total}
`);
     const answer = `
Order #${orderNumber}
Status: ${orderData.status}
Order Date: ${orderData.created_at}
Total: $${orderData.total}
`.trim();

  return {
    type: "order_status",
    answer
  };
    }

    /* --------------------------------
      2️⃣ RAG FLOW (Docs / FAQ)
    -------------------------------- */

    // Rewrite question
    const refinedQuery = await transformQuery(question);

    // Embeddings
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GEMINI_API_KEY,
      model: "text-embedding-004",
    });

    const queryVector = await embeddings.embedQuery(refinedQuery);

    // Pinecone (dynamic import)
    const pineconePkg = await import('@pinecone-database/pinecone');
    const PineconeClass =
      pineconePkg.PineconeClient ||
      pineconePkg.Pinecone ||
      pineconePkg.default?.Pinecone ||
      pineconePkg.default;

    const pinecone = new PineconeClass({
      apiKey: process.env.PINECONE_API_KEY
    });

    const index =
      (typeof pinecone.index === 'function' && pinecone.index(process.env.PINECONE_INDEX_NAME)) ||
      (typeof pinecone.Index === 'function' && pinecone.Index(process.env.PINECONE_INDEX_NAME));

    const searchResults = await index.query({
      vector: queryVector,
      topK: 10,
      includeMetadata: true,
    });

    if (!searchResults?.matches?.length) {
      console.log("\nAnswer:\nI could not find the answer in the provided document.");
      return;
    }

    const context = searchResults.matches
      .map((m) => m.metadata?.text)
      .filter(Boolean)
      .join("\n\n---\n\n");

    history.push({ role: "user", content: question });

    const prompt = `
You are a Customer Support Assistant for a Magento eCommerce platform.
Answer ONLY using the provided context.
If the answer is not found, reply exactly:
"I could not find the answer in the provided document."

Context:
${context}

User Question:
${question}
`;

const response = await llm.invoke(prompt);

    const answer =
      typeof response.content === "string"
        ? response.content
        : response.content?.[0]?.text || "";

    return {
      type: "rag",
      answer
    };
  },
  { name: "magento-ai-agent" }
);



/*    const response = await llm.invoke(prompt);

    const answer =
      typeof response.content === "string"
        ? response.content
        : response.content?.[0]?.text || "";

    history.push({ role: "assistant", content: answer });

    console.log("\nAnswer:\n", answer);
  },
  {
    name: "magento-ai-agent",
    tags: ["magento", "rag", "orders", "pinecone", "langsmith"],
  }
);*/

/* --------------------------------
  Main Loop
-------------------------------- */
/*async function main() {
  while (true) {
    const userProblem = readlineSync.question("\nAsk me anything --> ");
    await chatting(userProblem);

    try {
      await RunTree.getSharedClient().awaitPendingTraceBatches();
    } catch (e) {
      console.error("LangSmith flush error:", e);
    }
  }
}

main();*/

export { chatting };
