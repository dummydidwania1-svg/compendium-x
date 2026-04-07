# Dashboard Demo Seed

This repo can seed the tailored dashboard mock journey into one Firebase account as real Firestore records.

It writes deterministic demo records into:

- `evaluations`
- `sessions`
- `profiles`

Only the chosen user sees that history in their dashboard because the seeded records are written with that user's `candidateId`.

## Why this exists

The original dashboard mock data was intentionally crafted to show a believable prep journey and richer analysis behavior. This seed script lets us assign that persona to a demo account without showing it to everyone.

## Preferred Flow On This Machine

Because this machine currently does not have `serviceAccountKey.json`, use the hidden authenticated route instead:

1. Sign into the target account in the app.
2. Open `/dashboard/demo-seed`
3. Confirm the signed-in email is correct.
4. Click `Seed Demo History`

This writes the demo persona into the currently signed-in Firebase user only.

## Admin Script

From the project root:

```powershell
npm run seed:dashboard-demo -- --email demo@example.com
```

Or by uid:

```powershell
npm run seed:dashboard-demo -- --uid FIREBASE_UID
```

Optional dry run:

```powershell
npm run seed:dashboard-demo -- --email demo@example.com --dry-run
```

Optional goal target:

```powershell
npm run seed:dashboard-demo -- --email demo@example.com --goal-target 50
```

## Requirements For The Admin Script

- `serviceAccountKey.json` must exist in the project root.
- The target user must already exist in Firebase Auth.

## Notes

- The seed is account-specific.
- The script upserts deterministic demo docs, so running it again updates the same seeded records instead of duplicating them.
- It does not delete the user's real history. For a pure demo dashboard, use a dedicated demo account.
- Seeded workspace snapshots use a local placeholder image at `/demo/workspace-placeholder.svg`.
