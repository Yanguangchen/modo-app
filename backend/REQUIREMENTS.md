# Clarity Workspace — backend requirements

Status: pilot specification (P0), derived from the product requirements in `README.md`.

The backend is the authority for identity, tenancy, permissions, persistence, AI execution, calendar writes, and audit. The web client may hide controls. It must not be the only place a rule is enforced.

## 1. Pilot scope

The pilot backend supports one organization tenant, Google Calendar, and the P0 workflows:

1. Preference-based profile and quiet hours.
2. Private source capture and structured transformations.
3. Editable task plans, Today state, and explained schedule proposals.
4. Approved calendar reads and writes, with idempotent retries.
5. Meeting plans, focus data, and separated meeting outputs.
6. Working Guide fields with per-field audience, preview, and revocation.
7. One Guide AI page that combines Working Guide preferences with published knowledge search and a Gemini 3 communication coach with citations.
8. Export, deletion, audit, and privacy-safe aggregate administration.

Live transcription, Slack or Teams import, autonomous sending, productivity scoring, and diagnosis inference are rejected by configuration and by request handlers.

## 2. Decisions for this specification

| Decision | Pilot choice |
| --- | --- |
| Web client | Vite app on Vercel. The client holds only public configuration |
| API runtime | Node.js and TypeScript on Cloud Run, JSON over HTTPS |
| Identity | Firebase Authentication with the Google provider. Roles and `tenant_id` are custom claims |
| Primary store | Cloud Firestore in the same Google Cloud project. Documents carry `data_domain` and are filtered by tenant and owner |
| Client data access | Firestore security rules deny every client read and write. The API uses the Admin SDK |
| API auth | `Authorization: Bearer` Firebase ID token. No application session cookie |
| Calendar | Google Calendar only. Sign-in and calendar consent are separate OAuth steps |
| Product AI | Google AI Studio Gemini API, model `gemini-3-flash-preview`. The key is `GEMINI_API_KEY` on the API only. Structured outputs are schema-validated before they are stored or returned |
| Guide AI | Cloud Run retrieves only the user-enabled Working Guide context and published organization guidance, then calls Gemini 3 Flash with `backend/prompts/communication-coach.md` |
| Private content at rest | Google-managed encryption, plus Cloud KMS encryption of private bodies and calendar refresh tokens |
| Secrets | Google Secret Manager in deployed environments. `.env` is for local runs only |
| Reminders | Stored quiet-hour rules. The client schedules local reminders. No push vendor |
| Text storage | Source text stays in Firestore, size-capped. No Cloud Storage bucket |
| Region | `asia-southeast1` for Cloud Run and Firestore. Gemini requests go to the Google AI Studio API |

Firebase and Google Cloud use one project. Vercel does not run the API and does not receive service-account credentials.

## 3. Services

| Service | Responsibility |
| --- | --- |
| Vercel | Serves the web client and injects `VITE_` configuration per environment |
| Firebase Authentication | Google sign-in, ID tokens, custom claims |
| Cloud Run API | Preferences, sources, transformations, tasks, time blocks, meetings, guides, export, deletion, approval gates |
| Firestore | Private, shared, and published documents |
| Secret Manager | OAuth client secret and other deployed secrets |
| Cloud KMS | Keys for private bodies and calendar refresh tokens |
| Google Calendar API | Least-privilege read, approved write, disconnect, idempotency |
| Google AI Studio | Gemini 3 Flash for task and meeting transformations plus the Guide AI chat. Retrieval, citations, schema validation, and safety checks stay on Cloud Run |
| Cloud Scheduler | Retention deletes, calling Cloud Run with its own service account |
| Cloud Logging and Cloud Trace | Availability, latency, failures, and privacy-safe metrics |

Authorization, schema checks, and approval gates run on Cloud Run.

## 4. Identity, tenancy, and roles

The browser signs in with Firebase Authentication. Each API call sends a fresh ID token. Cloud Run verifies the token with the Firebase Admin SDK and reads `tenant_id` and `roles` from custom claims. A user in tenant A cannot address tenant B’s documents.

The first authenticated call is `POST /v1/me/bootstrap`. It creates the user document only when that email is on the tenant invite list. Unknown users receive `not_invited` and no workspace.

Roles:

| Role | Can do |
| --- | --- |
| `member` | Own a private workspace, share selected objects, read published knowledge, read Working Guide fields shared with them |
| `knowledge_owner` | Create and publish knowledge in their tenant, see review dates for articles they own |
| `admin` | Manage invites and role claims, retention settings, knowledge ownership, and read aggregate metrics plus administrative audit events |

An employer-paid seat does not grant `admin` or a person’s manager read access to private content. Manager is an audience on a shared field, not a role with broader data access.

Decision: the pilot uses Google sign-in only, without multi-factor authentication. Role changes are written as custom claims by an admin path and take effect on the next token refresh.

Authorized domains in Firebase Authentication include `localhost`, the Vercel production domain, and the Vercel preview domain used for this project.

## 5. Data domains

| Domain | Examples | Who can read |
| --- | --- | --- |
| `private` | Prompts, pasted messages, drafts, private notes, unfinished plans, preference values, resume notes | Owning user |
| `shared` | A Working Guide field or meeting summary the owner explicitly shared | Owner, plus the recorded audience, until revocation |
| `published` | Approved knowledge articles and organization templates | Tenant members |

New personal content is written as `private`. Sharing copies a previewed snapshot into `shared` and stores the audience, source version, and revocation state. Revocation marks that snapshot inaccessible. It does not delete the owner’s private source.

Firestore rules are a backstop:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

The Admin SDK bypasses these rules, so every query in Cloud Run still filters on `tenant_id` and the caller’s ownership or audience.

Document layout:

| Path | Contents |
| --- | --- |
| `tenants/{tenantId}` | Retention settings, invite list, cohort metrics inputs |
| `tenants/{tenantId}/users/{userId}` | Profile, preferences, calendar connection metadata |
| `tenants/{tenantId}/users/{userId}/sources/{sourceId}` | Private source artifacts |
| `tenants/{tenantId}/users/{userId}/transformations/{id}` | Private transformations and card versions |
| `tenants/{tenantId}/users/{userId}/tasks/{taskId}` | Private tasks and resume notes |
| `tenants/{tenantId}/users/{userId}/timeBlocks/{id}` | Proposed and approved blocks |
| `tenants/{tenantId}/users/{userId}/meetings/{id}` | Meeting plans and private notes |
| `tenants/{tenantId}/guides/{ownerId}/fields/{fieldId}` | Guide values. Shared snapshots live in a sibling `snapshots` collection |
| `tenants/{tenantId}/knowledge/{articleId}` | Draft and published article versions |
| `tenants/{tenantId}/audit/{eventId}` | Append-only audit events |
| `tenants/{tenantId}/users/{userId}/secrets/calendar` | KMS-wrapped refresh token. No client path |

Logs, traces, analytics, and support diagnostics store identifiers, timings, status codes, and policy outcomes. They omit titles, message bodies, prompts, notes, and model outputs. Cloud Logging exclusions and a redacting logger enforce that.

## 6. Core records

Names match the product objects. The API flattens these into the shapes already used by `frontend/src/lib/types.ts`.

### PreferenceProfile

User, theme, motion, surface, density, text scale, font, Today view, default buffer minutes, quiet-hour window, summary-first, and consent flags. Duration learning is stored only after an explicit opt-in and can be reset. That learning flag ships as data now and is unused until P1.

### SourceArtifact

Owner, source type (`typed`, `pasted`, `upload`), original content, provenance, sensitivity, timestamps. Original content is immutable after insert.

### Transformation

Source id, mode, schema version, model id, structured cards, assumptions, supporting source spans, user edits, status (`draft`, `accepted`, `reported`). Accepted card edits are kept when another card is regenerated.

Modes: `make_explicit`, `break_down`, `help_me_say_this`, `show_as_cards`, `show_as_mind_map`, `prepare_conversation`.

### TaskPlan and Task

Goal, ordered steps, dependencies, duration or range, inputs, expected output, definition of done, optional energy level, source span. Task execution state is one of `planned`, `ready`, `in_progress`, `paused`, `completed`, `rescheduled`, `returned`. A resume note is private.

### TimeBlock

Link to a task or meeting, start, end, buffer, destination calendar, approval state (`proposed`, `approved`, `written`, `failed`), idempotency key, external event id.

### ScheduleProposal

Two or three options when more than one arrangement is viable: earliest completion, lowest context switching, balanced workload. Each option stores a plain-language reason and the constraints it honored (work hours, existing events, focus windows, breaks, buffers, quiet hours).

### MeetingPlan

External event link when one exists, purpose, outcome, role, contribution, agenda with time allocation, preparation, decision owner, materials, transition buffers, decisions, actions, questions, private notes, parking lot. Decisions, actions, questions, and private notes are separate child records.

### WorkingGuideField

Owner, field type, value, audience (`private`, `selected`, `team`, `organization`), selected principal ids when audience is `selected`, version, revoked time.

### KnowledgeArticle

Owner, source, content, audience, version, last reviewed, next review, publication state. Only `published` versions are searchable by members. The article library is a Firestore query on title and tags inside the tenant. The Guide AI client never queries Firestore directly. Cloud Run retrieves matching published documents and presents them to Gemini with this source header:

```
Title: …
Owner: …
Source: …
Version: …
Last reviewed: …
Next review: …

<body>
```

Unpublished and replaced versions are excluded from retrieval immediately. Private and shared documents are never included in the published-knowledge query.

### AuditEvent

Actor, action, object id, destination audience or system, time, result, policy context. A transaction stores a hash of the previous event in that tenant. Private bodies are not copied into the event.

### ConsentRecord

User, purpose (`calendar_read`, `calendar_write`, `ai_transform`, `duration_learning`), granted or withdrawn time, scope text shown to the user.

## 7. Authorization rules

1. The verified ID token resolves `tenant_id`, `user_id`, and roles before a handler reads data.
2. Private documents are readable and writable only by `owner_user_id`.
3. Shared documents are readable by the owner and by principals inside the audience snapshot. A team or organization audience is evaluated inside the same tenant.
4. Preview builds the audience view on Cloud Run and returns that payload only to the owner.
5. Admins can list users, roles, connector status, retention settings, article review dates, and aggregate counts. Admin list and get routes for sources, transformations, tasks, notes, and guide values do not exist.
6. Knowledge answers may cite published articles in the caller’s tenant. Retrieved text is untrusted data and cannot change tools, roles, or write permissions.
7. The calendar refresh token is wrapped with Cloud KMS, stored under the connecting user, and usable only for the granted Google Calendar scopes.
8. Sharing, publishing, and calendar mutation require a confirmation flag on the write request and an audit event that names the approving user.
9. `POST /internal/retention` accepts only the Cloud Scheduler service account, verified as a Google-signed OIDC token. It is not a public route.

## 8. API surface

Base path `/v1`. JSON. Authenticated routes expect `Authorization: Bearer <Firebase ID token>`. Error bodies contain a stable `code`, a short recovery message, and no private content echoed back from storage.

Writes that leave the system require header `Idempotency-Key`. Replays with the same key and same user return the original result.

Cloud Run allows browser calls from `http://localhost:5173`, the Vercel production origin, and preview origins for this Vercel project.

### Session and profile

Sign-in and sign-out happen in the browser through Firebase Authentication. The API does not collect passwords.

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/me/bootstrap` | Verify the ID token, accept an invited user, return user, tenant, and roles |
| `GET` | `/me` | User, tenant, roles |
| `GET` `PUT` | `/me/preferences` | PreferenceProfile |
| `POST` | `/me/export` | Export the caller’s private and shared-owned data |
| `DELETE` | `/me/data` | Delete the caller’s private content and calendar token, subject to the tenant retention policy |

### Sources and transformations

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/sources` | Store original text. Domain `private` |
| `GET` | `/sources/:id` | Owner read of the original |
| `POST` | `/transformations` | Body: `sourceId`, `mode`, optional tone, audience, phrases to keep, phrases to avoid. Returns schema-valid cards plus assumptions |
| `GET` | `/transformations/:id` | Owner read, including version history metadata |
| `PATCH` | `/transformations/:id/cards/:cardId` | Edit one card |
| `POST` | `/transformations/:id/cards/:cardId/regenerate` | Replace that card only |
| `POST` | `/transformations/:id/restore` | Restore an earlier accepted version |
| `POST` | `/transformations/:id/report` | Record harmful, inaccurate, or unhelpful output without putting the body in logs |
| `POST` | `/transformations/:id/materialize` | Turn selected cards into tasks, agenda items, questions, or notes, with provenance |

Generation responses include `interpretation` labels and source spans. Unknown owners, dates, and outputs stay unknown.

### Tasks, Today, and schedule

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/today?date=` | Now, up next, timeline blocks, unscheduled tasks |
| `POST` | `/tasks` | Quick capture or structured create |
| `PATCH` | `/tasks/:id` | Edit fields, including start placement |
| `POST` | `/tasks/:id/transition` | `start`, `pause`, `resume`, `complete`, `reschedule`, `return_to_plan` |
| `PUT` | `/tasks/:id/resume-note` | Private interruption context |
| `POST` | `/schedule/proposals` | Two or three explained options, or one option when only one arrangement is viable |
| `POST` | `/time-blocks` | Create a proposed block |
| `POST` | `/time-blocks/:id/approve` | Confirm, then write to Google Calendar if a destination is set |

`approve` is the only route that calls the Google Calendar write API.

### Calendar connector

Google sign-in does not grant Calendar scopes. The user connects Calendar in a second consent step. The first consent requests `calendar.readonly`. Write scope is requested on the approval step.

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/integrations/calendar` | Connection state and granted scopes |
| `GET` | `/integrations/calendar/start` | Start Google OAuth for Calendar |
| `GET` | `/integrations/calendar/callback` | Store the KMS-wrapped refresh token |
| `DELETE` | `/integrations/calendar` | Revoke the token and mark the connector disconnected |
| `GET` | `/integrations/calendar/events?from&to` | Read events for Today and meeting import |

### Meetings

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` `POST` | `/meetings` | List and create plans |
| `GET` `PATCH` | `/meetings/:id` | Read and edit plan fields |
| `POST` | `/meetings/:id/clarify-request` | Draft a private message asking the organizer for missing purpose, outcome, role, or contribution. Nothing is sent |
| `POST` | `/meetings/:id/decisions` | Add a decision |
| `POST` | `/meetings/:id/actions` | Add an action with owner and time expectation |
| `POST` | `/meetings/:id/questions` | Add an open question |
| `PUT` | `/meetings/:id/private-notes` | Owner-only notes |
| `POST` | `/meetings/:id/actions/:actionId/accept` | Copy a reviewed action into tasks or an approved time block |

### Working Guide

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` `PUT` | `/guide/fields/:fieldId` | Owner read and edit. Audience defaults to `private` |
| `POST` | `/guide/preview` | Body: audience kind and, when needed, principal ids. Returns the exact shared view |
| `POST` | `/guide/share` | Publish the previewed snapshot |
| `POST` | `/guide/revoke` | End access to the snapshot |
| `GET` | `/guide/shared/:userId` | Fields the caller is allowed to see for that person |

### Knowledge and admin

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/knowledge?q=` | Published articles: title, owner, source, version, review dates |
| `GET` | `/knowledge/:id` | Published article body |
| `POST` `PATCH` | `/knowledge` | `knowledge_owner` draft, publish, and unpublish |
| `POST` | `/guide/chat` | Answer with Gemini 3 using the requested Working Guide and published-knowledge context; return citations with title, owner, and version |

`POST /guide/chat` requires authentication. The request selects context categories but does not send stored Working Guide or article bodies from the browser; Cloud Run fetches authorized context. Chat transcripts are not persisted by default. The route never receives task text, notes, calendar details, or another person’s unshared guide fields.
| `GET` | `/admin/metrics` | Aggregate counts with a minimum cohort size |
| `GET` | `/admin/audit` | Administrative and sharing events the caller’s role may see |

Minimum cohort size is 5. Smaller groups are omitted from a metric rather than shown as an individual pattern.

## 9. AI behavior

### 9.1 Product transformations

Cloud Run calls the Gemini API with `GEMINI_API_KEY` from Secret Manager. There is no model API key in the client or in Vercel. `GEMINI_MODEL` is `gemini-3-flash-preview`. Prompts leave the API process for Google AI Studio. Firestore and Cloud Run stay in `asia-southeast1`. This split is part of the Personal Data Protection Act review before pilot.

Each transformation mode has a versioned prompt, a JSON schema, and an evaluation set. Those assets are deployable without an application release.

A successful generation:

1. Sends the source as untrusted content, wrapped so instructions inside it cannot change tool use or permissions.
2. Asks Gemini 3 Flash for a schema object that separates original support, interpretation, requirements, uncertainty, questions, and next actions.
3. Rejects responses that invent an owner, date, or constraint absent from the source. Those fields return as unknown and produce a clarification question.
4. Stores model id, prompt version, and schema version on the transformation.
5. Uses `AI_REQUEST_TIMEOUT_MS` as the short-transform budget. The default is eight seconds. The client shows progress as soon as the request starts.
6. Uses the Gemini API. The integration must not opt into a training or caching feature that retains prompt content for model improvement.

The model must not be asked to diagnose, infer emotion or potential, score performance, or recommend an employment decision. Safety checks reject those output classes before storage.

### 9.2 Communication coach

The coach teaches colleagues and managers how to communicate clearly with neurodivergent colleagues. It runs through the authenticated Cloud Run `POST /guide/chat` route and uses Gemini 3 Flash. Web search is off. Its only retrieved sources are the caller’s explicitly enabled Working Guide fields and matching published guidance from the caller’s tenant.

The system instruction is `backend/prompts/communication-coach.md`. Cloud Run returns citations with each answer; every cited article names its title, owner, and version. When retrieval returns nothing, the coach says the organization guidance does not cover the question and does not invent a policy.

Retrieved article text is untrusted. Instructions inside an article cannot change the agent rules, permissions, or tools.

The coach does not read private workspace data, diagnose, infer that a person is neurodivergent, score performance, or send messages. A person’s needs come from a Working Guide they have already shared, or from the question the employee asks. One condition does not imply one communication style.

## 10. Calendar writes

1. Proposals and draft time blocks do not call Google Calendar.
2. `POST /time-blocks/:id/approve` rechecks ownership, quiet hours, and buffers, then writes.
3. The idempotency key is stored with the Google event id. A retry after a timeout fetches by that key and does not create a second event.
4. Disconnect revokes the refresh token and stops future reads and writes. Existing Google events remain until the user deletes them in Calendar.
5. Failure returns `calendar_write_failed` and leaves the block in `failed` so the user can retry. Local tasks stay intact.

## 11. Privacy, retention, and deletion

| Class | Pilot default | Configuration |
| --- | --- | --- |
| Private content | Kept until the user deletes it or leaves, then deleted within 30 days | `RETENTION_PRIVATE_DAYS` |
| Shared snapshots | Kept until revoked, then deleted within 30 days | `RETENTION_SHARED_DAYS` |
| Audit events | 365 days | `RETENTION_AUDIT_DAYS` |
| Published knowledge | Kept until a knowledge owner unpublishes it | Not a day-count |

Cloud Scheduler runs the retention job daily. Export returns a JSON archive of the caller’s private data and the shared objects they own. Admin export of another person’s private workspace does not exist.

Encryption in transit is HTTPS on Vercel and Cloud Run. Private body fields and the calendar refresh token are encrypted with the Cloud KMS key in `KMS_KEY_NAME` before they are written to Firestore. Firestore and Cloud Run also use Google-managed encryption at rest.

`GCP_REGION=asia-southeast1` places Firestore and Cloud Run in Singapore. Gemini processing uses the Google AI Studio API. Guide chat messages and retrieved context therefore leave the Singapore region and are in scope for the Personal Data Protection Act review before pilot.

Deployed Cloud Run receives secrets from Secret Manager through the runtime service account. The image does not contain a service-account JSON key. Local development uses Application Default Credentials.

## 12. Nonfunctional requirements

| Area | Target |
| --- | --- |
| Ordinary reads | p95 under 300 ms inside `asia-southeast1`, so primary navigation can meet the one-second product budget |
| Short AI transforms | Timeout at `AI_REQUEST_TIMEOUT_MS` (default 8000). Client shows progress before that |
| Availability | 99.9 percent monthly for general release. Pilot target is one region with tested restore |
| Calendar writes | Idempotent. Duplicate-event tests are a release gate |
| Draft durability | Accepted Firestore writes are committed before the response. Client offline drafts stay in the browser until sync |
| Audit | Shared objects and external writes trace to actor, source version, and approval |
| Privacy | Cloud Logging redaction is tested with fixture private strings that must be absent from log entries |
| Client hosting | Vercel production and preview builds contain only `VITE_` values |

## 13. Environment contract

Local names live in `.env.example` at the repository root. Copy it to `.env` for the API and the Vite dev server.

Vercel project settings hold the same public `VITE_` names for Production and Preview, including the Guide AI path, label, and client timeout. Cloud Run holds the private `GUIDE_AI_*`, `GEMINI_API_KEY`, and other API settings; credentials are referenced from Secret Manager and never use the `VITE_` prefix.

The API refuses to boot when `APP_ENV=production` and any required setting is empty, when `ENABLE_MESSAGE_IMPORT` or `ENABLE_TRANSCRIPTION` is true, or when `GCP_REGION` is empty. Variables prefixed with `VITE_` are public in the web bundle. Secrets must not use that prefix.

Local Firebase emulators may set `FIREBASE_AUTH_EMULATOR_HOST` and `FIRESTORE_EMULATOR_HOST`. Those variables stay unset in Cloud Run.

## 14. Acceptance mapped to product requirements

| Product ids | Backend evidence |
| --- | --- |
| SCH01–SCH06, SCH08, SCH09 | Google Calendar connect, Today read model, proposals, approve-before-write, buffers, quiet hours |
| SCH07, SCH11 | Task transitions and resume notes |
| COM01–COM10 | Source retention, modes, cards, spans, undo, materialize. Mind-map outline is a schema section, not only a visual |
| MTG01–MTG06 | Meeting plan, clarify draft, buffers, separated outputs, accept action |
| GUI01–GUI06 | Unified Guide AI page, guide fields, preview, revoke, knowledge search, and Gemini coach citations with title, owner, and version |
| PRV01–PRV09 | Domain defaults, audience on share, no admin private routes, least-privilege Calendar scopes, TLS, KMS, tenant tests, audit chain, redacted Cloud Logging, export and delete |
| §16, §19.2 | Gemini 3 Flash schema validation, retrieval limited to authorized guide fields and published guidance, idempotency, approval actor |

P1 and P2 product items are stored as flags or unused fields where noted, and have no pilot routes beyond that.
