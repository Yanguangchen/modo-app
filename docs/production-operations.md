# Modo production operations

## Current architecture

Production site: https://modo-iota.vercel.app/.

- Vercel serves the frontend and the API function in [`api/index.ts`](../api/index.ts). Root [`vercel.json`](../vercel.json) routes `/v1/*` to that function. The deployed API is **not on Cloud Run**.
- Firebase Authentication signs users in. The frontend sends their Firebase ID token as `Authorization: Bearer …`; the API verifies it before protected operations.
- Firestore stores workspace data. The Vercel backend uses Google Cloud Workload Identity Federation to access Firestore and Firebase Admin services without a downloaded service-account key.
- The backend calls the Gemini API directly using the server-only `GEMINI_API_KEY`, through [`backend/src/ai.ts`](../backend/src/ai.ts). Database/admin federation is separate from Gemini authentication, not an extra AI routing hop.
- Private body fields use per-user AES-256-GCM data keys. Current production wraps those keys with the server-only `APP_ENCRYPTION_KEY`; KMS is optional and is not used by this setup.

Earlier Cloud Run/KMS references in the requirements describe the original design, not the current deployment. Do not provision Cloud Run or KMS to resolve this incident.

## Resolved incident: authenticated workspace and AI requests returned 500

Status: **resolved; user confirmed the fix worked on 2026-09-23**. The investigation and production outcome below record the supplied incident report; documenting it did not perform another deployment or signed-in production test.

### Symptoms and evidence

- Sign-in and `POST /v1/me/bootstrap` succeeded.
- `GET /v1/workspace` and `POST /v1/transformations` returned 500 when loading private data.
- The UI displayed “Something went wrong. Your work is safe; try again.”
- A deliberately invalid bearer token produced `invalid_token`, showing that the Authorization header reached the API in that test.
- The investigation inspected only the affected key's type in Firestore, not its value, and confirmed `kms: 'none'`.

### Root cause

A local development run had used the real Firestore database without key wrapping configured. It stored a per-user data key unwrapped at:

```text
tenants/{tenantId}/users/{uid}/secrets/dek
```

The stored marker was `kms: 'none'`. Production refused to unwrap that legacy key, so routes depending on `userKey()` failed before they could finish loading private data or generate an AI result. This was not a Gemini API-key failure, a missing API route, or evidence of a sign-in failure.

“Unwrapped key” does not mean all body fields were stored as plaintext: the body fields were encrypted, but their decryption key was stored without an additional wrapping layer.

### Implemented fix

[`backend/src/crypto.ts`](../backend/src/crypto.ts), in `userKey()`:

1. Detects an existing `kms: 'none'` key when a wrapping configuration is available.
2. Wraps the **same existing data key** and awaits saving it back to the same document. With `APP_ENCRYPTION_KEY`, the marker becomes `env:v1`.
3. Returns/caches that same key, so existing encrypted tasks, notes, and other private fields remain readable. It does not replace the key or rewrite all private documents.

This is lazy migration on access, not a bulk migration of every user. Direct unwrapping of `kms: 'none'` still fails in production. Creating a new unwrapped key now requires both non-production mode and `FIRESTORE_EMULATOR_HOST`; local mode alone no longer permits unwrapped writes to a real database.

Regression tests in [`backend/src/crypto.test.ts`](../backend/src/crypto.test.ts) cover legacy rewrapping, reading previously encrypted content after migration and cache clearing, and rejecting new unwrapped keys outside the emulator.

## Distinguish failures before changing infrastructure

| Response | Meaning / next check |
| --- | --- |
| `401 unauthenticated` | No usable bearer token was supplied. Opening an API URL directly or using curl without a token normally produces this. If it happens inside the app, inspect sign-in state and the request header without copying or logging its value. |
| `401 invalid_token` | A token was supplied but verification failed. A deliberately invalid test token is expected to produce this; it does not prove a real user session works. |
| `500 internal` after successful bootstrap | Inspect the failing private-data operation. Legacy unwrapped keys caused this incident, but not every 500 has that cause. |
| `503 backend_not_configured` | Investigate backend credentials, federation, and database permissions separately. |

The frontend API client also raises `unauthenticated` locally if there is no current Firebase user, before sending a request. A standalone unauthenticated response does not prove production strips headers or that Gemini is broken.

## Configuration and data safety

- Keep `APP_ENV=production` on Vercel production. Keep the production `APP_ENCRYPTION_KEY` secret, stable, and securely recoverable. It is a base64-encoded 32-byte key and must never have a `VITE_` prefix.
- **Do not regenerate or delete `APP_ENCRYPTION_KEY` to fix an error.** Existing `env:v1` records depend on it. Changing wrapping keys requires a planned migration with access to the old key.
- Do not delete the user's `secrets/dek` document or generate a replacement data key: existing encrypted content depends on the original key.
- Keep `KMS_KEY_NAME` empty for the current no-KMS setup. Do not treat “no KMS” as “disable encryption.”
- Keep production emulator variables unset. Keep all four federation variables configured together: `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, and `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`.
- Never log wrapping keys, user data keys, ID tokens, Gemini keys, or private workspace content. For key-state diagnosis, inspect only the `kms` marker with a field mask.

## Safe local development

The example environment currently names the real Firebase project. Copying it and setting `APP_ENV=local` does **not** isolate development from production.

Prefer a dedicated demo project with the Firebase emulators, or a separate test database. For the emulator setup, use matching demo project IDs for backend and frontend, point the server to the configured Auth/Firestore emulator ports, and configure the frontend's `VITE_FIREBASE_AUTH_EMULATOR_URL`. Leave the four production federation fields empty. Emulator services must actually be running; setting a host variable alone is not a complete setup.

After a production key is migrated to `env:v1`, any local process deliberately accessing that data also needs the same protected `APP_ENCRYPTION_KEY` and authorized database credentials. Do not distribute the production key for routine development; use isolated test data instead.

## Verification and deployment handoff

1. Run `npm --prefix backend test` and `npm --prefix backend run build` after encryption changes.
2. Review the worktree and coordinate with other active sessions before deploying. Do not silently ship unrelated or unfinished edits.
3. Deploy from the repository root and verify the linked Vercel project is `modo`; the frontend subdirectory may link to a different project.
4. The production build's `check:cloud` checks federation, a Firestore read, a Firebase Auth read, and an in-memory key-wrapping round trip. It **does not** test an existing user's stored key or a complete signed-in AI request.
5. Verify in the signed-in app: bootstrap succeeds, workspace loads, previously saved content remains readable, and an AI request completes. Check that the relevant 500s stop. A health check or unauthenticated curl request is insufficient to close this incident.

Do not run integration tests against production: the emulator integration suite deletes its test tenant collection. Confirm emulator hosts and a demo project before running it.
