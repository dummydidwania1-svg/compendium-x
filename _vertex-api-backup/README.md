# Vertex AI API Integration (Backup)

These files contain the Vertex AI Express API integration that was used in the local Vite-based dashboard. The main app now uses Google AI Studio API keys instead.

## Files

| File | Original Location | Purpose |
|------|-------------------|---------|
| `vertexExpress.ts` | `src/lib/vertexExpress.ts` | Core Vertex AI SDK wrapper (auth, retry, response parsing) |
| `geminiCoach.vertex.ts` | `src/lib/geminiCoach.ts` | Coach Insight system prompt + Vertex API call |
| `geminiFeedback.vertex.ts` | `src/lib/geminiFeedback.ts` | Feedback Analyser system prompt + Vertex API call |
| `CoachInsight.vertex.tsx` | `src/components/dashboard/CoachInsight.tsx` | Manual-trigger Coach component (checks `VITE_VERTEX_COACH_API_KEY`) |
| `CoachInsight.autorun.vertex.tsx` | `src/components/dashboard/CoachInsight.autorun.tsx` | Auto-run Coach variant (fires on mount + filter change) |
| `env.local.vertex` | `.env.local` | Actual API keys (Vertex Express keys + model names) |
| `env.example.vertex` | `.env.example` | Template for Vertex env vars |

## How to Switch Back to Vertex AI

1. Copy `vertexExpress.ts` to `src/lib/vertexExpress.ts` (or `lib/vertexExpress.ts` in Next.js)

2. Replace `src/lib/geminiCoach.ts` (or `lib/geminiCoach.ts`) with `geminiCoach.vertex.ts`
   - This changes the `callGemini()` function to use Vertex Express instead of Google AI Studio

3. Replace `src/lib/geminiFeedback.ts` (or `lib/geminiFeedback.ts`) with `geminiFeedback.vertex.ts`
   - This changes `callGeminiFeedback()` to use Vertex Express

4. Replace the CoachInsight component with `CoachInsight.vertex.tsx`
   - Key difference: checks for `VITE_VERTEX_COACH_API_KEY` instead of `NEXT_PUBLIC_GEMINI_API_KEY`

5. Add these env vars (from `env.local.vertex`):
   ```
   VITE_VERTEX_COACH_API_KEY=your_vertex_key
   VITE_VERTEX_FEEDBACK_API_KEY=your_vertex_key
   VITE_VERTEX_COACH_MODEL=gemini-3.1-flash-lite-preview
   VITE_VERTEX_FEEDBACK_MODEL=gemini-3.1-flash-lite-preview
   ```
   For Next.js, prefix with `NEXT_PUBLIC_` instead of `VITE_`

## Key Differences: Vertex vs Google AI Studio

| Aspect | Vertex AI Express | Google AI Studio |
|--------|-------------------|------------------|
| Base URL | `aiplatform.googleapis.com/v1beta1` | `generativelanguage.googleapis.com` |
| Auth header | `x-goog-api-key` | `x-goog-api-key` (same) |
| Env var prefix | `VITE_VERTEX_*` / `NEXT_PUBLIC_VERTEX_*` | `VITE_GEMINI_*` / `NEXT_PUBLIC_GEMINI_*` |
| SDK module | `vertexExpress.ts` (custom) | `@google/generative-ai` (npm package) |
| Default model | `gemini-2.5-flash-lite` | Depends on AI Studio config |

## Notes

- The system prompts (`buildSystemPrompt`, `buildUserMessage`) are identical between both versions. Only the API call layer differs.
- The `CoachInsight.autorun.vertex.tsx` variant auto-fires on mount and debounces on filter changes (1500ms). The main `CoachInsight.vertex.tsx` requires manual button click.
