# Transcription configuration

The participant (dual-mic) transcription path supports two providers, selected
at deploy time via environment variables in `functions/.env` (gitignored).

## Provider selection

| Env var | Default | Values | Effect |
|---|---|---|---|
| `TRANSCRIBE_PROVIDER` | `elevenlabs` | `elevenlabs` \| `gemini` | Which engine transcribes dual-mic (subcollection) tracks. |
| `ELEVENLABS_MODEL` | `scribe_v2` | `scribe_v2` \| `scribe_v1` | ElevenLabs Scribe model id. |
| `ELEVEN_TURN_GAP_MS` | `1500` | integer (ms) | Silence gap that starts a new turn when grouping Scribe words. |

> The legacy/local single-track path (`transcribeRecording`) is **always Gemini**
> and is unaffected by these settings.

## Why ElevenLabs Scribe (default)

Gemini *generates* `[t=]` timestamps as LLM tokens — unreliable / non-monotonic /
compressed — which collapsed the dual-mic merge (all turns landed at offset 0).
ElevenLabs Scribe is an ASR model that *measures* each word's start/end from the
waveform, so per-turn offsets are monotonic and span the full take. The merge
then interleaves both tracks correctly, and each line is labeled
`Candidate:` / `Interviewer:` (role is 100% certain in dual-mic — one person per
track, no diarization guessing).

## Secret

`ELEVENLABS_API_KEY` is a Firebase secret (Google Secret Manager), set via:

```
firebase functions:secrets:set ELEVENLABS_API_KEY
```

Never commit the key. The `transcribeParticipantRecording` function reads it.

## Safety / rollback

- **Per-track auto-fallback:** any ElevenLabs error (bad key, outage, 429/5xx)
  is caught and that track falls back to the existing Gemini path. A session
  never fails just because ElevenLabs hiccuped.
- **Instant rollback to Gemini:** add `TRANSCRIBE_PROVIDER=gemini` to
  `functions/.env` and redeploy functions. No code revert needed.

## Local `functions/.env` example (not committed — `.env*` is gitignored)

```
# Override transcription provider back to Gemini if needed:
# TRANSCRIBE_PROVIDER=gemini

# Override the Scribe model:
# ELEVENLABS_MODEL=scribe_v1

# Override the turn-grouping silence gap (ms):
# ELEVEN_TURN_GAP_MS=1500
```
