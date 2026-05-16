This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Create a `.env.local` file with:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
GEMINI_API_KEY=...
# Optional override (default: gemini-2.5-flash-lite)
GEMINI_TRANSCRIBE_MODEL=gemini-2.5-flash-lite
```

`GEMINI_API_KEY` is used only in the server route (`/api/transcribe`) for audio-to-text.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Backend (Firebase)

The Firebase project (`compendium-x`) is version-controlled from this repo:

| File | Purpose |
|------|---------|
| `firebase.json` | Manifest — tells the Firebase CLI what this repo deploys (rules, indexes, emulators). |
| `.firebaserc` | Pins this repo to the `compendium-x` Firebase project. |
| `firestore.rules` | Security rules controlling who can read/write each Firestore collection. |
| `storage.rules` | Security rules for uploaded files (recordings, workspace images). |
| `firestore.indexes.json` | Composite indexes Firestore needs to answer multi-field queries. |
| `functions/` | Firebase Cloud Functions — currently hosts the long-running transcription job. |
| `serviceAccountKey.json` | Admin credentials for server-side scripts. **Never commit.** Gitignored. |

### One-time setup

1. **Install Java** (needed by the Firestore + Storage emulators):
   ```bash
   brew install --cask temurin
   ```
2. **Log in to Firebase** so you can deploy:
   ```bash
   npx firebase login
   ```
3. **Configure Vercel env vars** so server routes can authenticate as Firebase Admin:
   - Vercel dashboard → `compendium-x` project → Settings → Environment Variables
   - Add `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the entire contents of `serviceAccountKey.json` as a single line, scoped to Production + Preview
   - Trigger a redeploy so it takes effect
   - Locally this variable is not needed — the file at the repo root is used automatically.
4. **Upgrade Firebase to Blaze (pay-as-you-go)** — required to deploy Cloud Functions:
   - Firebase Console → Project Settings → Usage and billing → Modify plan → Blaze
   - Set a $5/month budget alert at the same time (Firebase Console → Usage and billing → Details and settings → Budget)
5. **Store the Gemini API key as a Firebase secret** (used by the transcription Cloud Function):
   ```bash
   npx firebase functions:secrets:set GEMINI_API_KEY
   # paste the same value you have in .env.local, hit enter
   ```
6. **Deploy the Cloud Function** (one-time + after function changes):
   ```bash
   cd functions && npm install && cd ..
   npx firebase deploy --only functions
   ```

### Local development with emulators (recommended)

Instead of `npm run dev` (which writes to production Firestore), use:

```bash
# Terminal 1 — start the local Firebase emulators
npm run emulators

# Terminal 2 — start Next.js pointed at the emulators
npm run dev:emulators
```

The Emulator UI runs at <http://127.0.0.1:4000> — you can inspect Firestore docs, Storage files, and emulated Auth users live.

### Deploying rules / indexes

```bash
npm run rules:deploy       # deploys firestore.rules + storage.rules
npm run indexes:deploy     # deploys firestore.indexes.json
```

### Deploying the transcription Cloud Function

```bash
cd functions
npm install
npm run build
cd ..
npx firebase deploy --only functions
```

Function logs (last hour) when something's misbehaving in prod:

```bash
npx firebase functions:log
```

### How transcription works

1. Candidate finishes recording → audio uploads to Firebase Storage.
2. Client calls `POST /api/sessions/[lobbyId]/recording` with metadata. This writes `recording.transcriptStatus: 'pending'` to the session doc.
3. Firestore-triggered Cloud Function `transcribeRecording` fires, downloads the audio, hands it to Gemini, and writes the transcript back to the session doc when done.
4. Dashboard / evaluation pages display the transcript via existing real-time listeners — no client polling needed.
5. If transcription fails, the candidate's workspace shows a Retry Transcript button that calls `POST /api/sessions/[lobbyId]/recording/retry-transcript` to re-queue.

The function has a 9-minute timeout (plenty for 45-minute audio at Gemini Flash speeds), runs on Blaze pricing, and is regional `us-central1`. Logs live in Firebase Console → Functions → Logs.

To inspect what's currently deployed in production (uses `serviceAccountKey.json`):

```bash
npm run rules:dump
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
