# Quick Start - Vercel Deployment Fix

## TL;DR - What Was Fixed

**Problem:** App works locally but fails on Vercel with "not valid JSON" error

**Root Cause:** Express server doesn't work well in Vercel serverless environment. API was returning HTML error pages instead of JSON.

**Solution:** 
- ✅ Created `/api/chat.js`, `/api/ingest.js`, `/api/health.js` serverless functions
- ✅ Added proper error handling to always return JSON
- ✅ Updated frontend to validate response types
- ✅ Created `vercel.json` with correct configuration

## What You Need to Do

### Step 1: Add Environment Variables to Vercel
Go to **Vercel Dashboard** → **Settings** → **Environment Variables**

Add these 4 required variables:
```
OPENAI_API_KEY=your_key
GEMINI_API_KEY=your_key
PINECONE_API_KEY=your_key
PINECONE_INDEX_NAME=your_index_name
```

### Step 2: Push Code to GitHub
```bash
git add .
git commit -m "Fix Vercel deployment"
git push
```

### Step 3: Verify It Works
Visit: `https://your-domain.vercel.app/api/health`

Should see JSON with all `true` values ✅

## Files Modified

| File | Change |
|------|--------|
| `api/chat.js` | NEW - Serverless chat function |
| `api/ingest.js` | NEW - Serverless ingest function |
| `api/health.js` | NEW - Health check function |
| `vercel.json` | UPDATED - Proper Vercel config |
| `server.js` | UPDATED - Better error handling |
| `public/index.html` | UPDATED - Response validation |

## Test Commands

```bash
# Check if API is working
curl https://your-domain.vercel.app/api/health

# Test chat endpoint
curl -X POST https://your-domain.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello!"}'

# Check function logs
# Go to Vercel → Project → Deployments → Functions tab
```

## If It Still Fails

1. Check Vercel function logs for errors
2. Run `/api/health` to see which env vars are missing
3. Verify env var names match exactly (case-sensitive)
4. Look for timeout errors (60-second limit)
5. Check API keys are valid and not expired

## Local Development Still Works

```bash
npm install --legacy-peer-deps
npm start
# Runs on http://localhost:3000
```

## Architecture

### Local (Development)
```
Frontend → Express Server (server.js)
         → Routes: /api/chat, /api/ingest, /api/health
```

### Production (Vercel)
```
Frontend → /api/chat → api/chat.js (serverless function)
        → /api/ingest → api/ingest.js (serverless function)
        → /api/health → api/health.js (serverless function)
```

## Key Improvements

1. **Proper Serverless Functions** - Vercel automatically converts `/api/*.js` files to functions
2. **JSON Always** - Every endpoint explicitly sets JSON headers and returns JSON
3. **Environment Variables** - Checks for required vars before processing
4. **Error Handling** - Catches and reports errors properly instead of returning HTML
5. **Frontend Validation** - Checks Content-Type before parsing JSON
6. **Logging** - All requests logged with `[FUNCTION_NAME]` prefix for debugging

## Done! 🎉

Your Vercel deployment should now work correctly. The application will:
- Accept chat queries via `/api/chat`
- Ingest documents via `/api/ingest`
- Return proper JSON responses always
- Show errors clearly without "not valid JSON" errors

See detailed guides:
- `VERCEL_DEPLOYMENT.md` - Complete deployment guide
- `ENV_VARS_SETUP.md` - Environment variable setup
- `DEPLOYMENT_FIX_SUMMARY.md` - Detailed technical explanation
