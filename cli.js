import { ingest } from './index.js';

ingest((msg) => console.log(msg)).catch((err) => {
  console.error('Fatal error:', err?.message ?? err);
  process.exit(1);
});
