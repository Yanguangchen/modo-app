# Neuroinclusive Workplace App

Status: Product requirements specification

Working title: **Clarity Workspace**

## 1. Product summary

Clarity Workspace is a workplace communication, planning, and meeting support application designed for people who benefit from greater structure, explicit language, predictable workflows, and reduced cognitive load.

The product is particularly intended to support autistic people, people with ADHD, people with dyslexia, and colleagues with overlapping or undisclosed support needs. It is not a diagnostic or medical tool. Access to useful features must never depend on disclosing a diagnosis.

The application acts as a clarity and execution layer around existing workplace tools. It helps a person understand a request, turn it into concrete steps, place those steps into a realistic schedule, prepare for meetings, and communicate clearly with colleagues.

The core workflow is:

1. Capture information.
2. Clarify meaning and uncertainty.
3. Structure the work.
4. Schedule realistic actions.
5. Execute one step at a time.
6. Confirm decisions and next actions.

## 2. Product decision

The product should personalize around support preferences rather than diagnoses. Two people with the same diagnosis may need very different interfaces, communication styles, reminders, and levels of detail.

The product must therefore ask questions such as:

* Do you prefer a short summary or full context first?
* Do you want one next action or the complete plan?
* Do visual cards, an outline, or a mind map help most?
* How much transition time do you need between meetings?
* How should the application signal urgency?
* Which information should remain private?

The language used throughout the product should distinguish between neurodivergent colleagues and neurotypical colleagues when that distinction is relevant. It should otherwise use inclusive terms such as employees, colleagues, managers, and team members.

## 3. Goals

1. Reduce the effort required to understand ambiguous workplace communication.
2. Help users turn work into clear, achievable, ordered steps.
3. Make scheduling visible, realistic, and easy to adjust.
4. Improve preparation, participation, and follow through for meetings.
5. Let employees explain how they work best without requiring medical disclosure.
6. Give all colleagues practical guidance for inclusive communication and collaboration.
7. Protect private thoughts, drafts, preferences, and planning data.
8. Fit around existing calendars and communication tools rather than replacing them.

## 4. Non goals

The product will not:

* Diagnose autism, ADHD, dyslexia, or any other condition.
* Infer a diagnosis, personality, emotion, or capability from user activity.
* Score employee productivity, engagement, attitude, or performance.
* Make employment, promotion, disciplinary, or accommodation decisions.
* Send messages or change calendars without explicit user approval.
* Give employers access to private prompts, notes, drafts, or unfinished plans.
* Present AI output as an authoritative interpretation of another person’s intent.
* Replace formal workplace accommodation, human resources, or occupational health processes.

## 5. Intended users

| User | Primary needs | Typical outcomes |
| --- | --- | --- |
| Employee | Understand requests, plan work, manage transitions, prepare for meetings | Clear next action, realistic schedule, lower cognitive load |
| Colleague | Communicate explicitly and inclusively | Better requests, fewer misunderstandings, usable team norms |
| Manager | Create predictable and accessible ways of working | Clear expectations, inclusive meetings, agreed follow through |
| Knowledge owner | Publish trusted internal guidance | Current, attributable, searchable guidance |
| Organization administrator | Configure access, retention, integrations, and governance | Safe deployment without visibility into private content |

## 6. Product principles

### 6.1 Private by default

Personal thoughts, pasted messages, AI transformations, private notes, and draft plans are visible only to their owner unless that person deliberately shares them.

### 6.2 AI proposes and the user decides

AI can suggest an interpretation, task plan, reply, or schedule. The user must be able to edit it and must approve any external action.

### 6.3 Preserve the source

The original request or message must remain available beside the transformed version. The application must never quietly replace source material with an AI interpretation.

### 6.4 Make uncertainty visible

AI generated assumptions must be labeled. Missing information should produce a clarification question, not fabricated certainty.

### 6.5 One calm next action

Every workflow should make the current action obvious without hiding the wider context from users who want it.

### 6.6 No shame language

Missed tasks, delayed work, and rescheduling should use neutral language such as Resume, Reschedule, Return to plan, or Review capacity.

### 6.7 Equivalent ways to interact

Dragging, voice input, visual maps, color, animation, and audio must always have accessible alternatives.

## 7. Information architecture

| Area | Purpose | Primary objects |
| --- | --- | --- |
| Today | Show what matters now and what comes next | Tasks, time blocks, focus sessions, reminders |
| Clarify | Reframe communication and structure ideas | Source material, cards, outlines, mind maps, reply drafts |
| Meetings | Support preparation, participation, and follow through | Meeting plans, agendas, decisions, actions, questions |
| Working Guide | Let an employee describe useful ways of working | Preference fields, visibility rules, audience previews |
| Knowledge | Give colleagues trusted inclusive working guidance | Articles, templates, examples, policies, support routes |
| Settings | Control accessibility, AI, integrations, privacy, and data | Preferences, connectors, permissions, retention choices |
| Administration | Configure the organization without exposing private content | Roles, policies, knowledge governance, aggregate adoption data |

## 8. Key user journeys

### 8.1 From unclear request to scheduled work

1. The employee pastes a message, uploads text, or types a thought.
2. The employee chooses Make explicit or Break down.
3. The application shows the original source and a structured interpretation.
4. Unclear points are separated from known requirements.
5. The employee edits or approves the interpretation.
6. The application creates an editable task plan with durations and dependencies.
7. The application proposes two or three schedule options.
8. The employee approves one option before any calendar entry is created.
9. Today shows the first action and the relevant source context.

### 8.2 From meeting invitation to completed follow through

1. The employee opens a calendar event in Meetings.
2. The application identifies missing purpose, outcome, agenda, role, or preparation details.
3. The employee creates or requests the missing information.
4. The application schedules preparation and transition time.
5. During the meeting, a focus view shows the current agenda item and private notes.
6. After the meeting, the employee separates decisions, actions, and open questions.
7. The employee reviews the summary before sharing it.
8. Approved actions can be added to Today and the calendar.

### 8.3 Sharing a Working Guide

1. The employee completes only the fields they find useful.
2. Each field has an independent audience setting.
3. The employee previews exactly what a chosen audience will see.
4. The employee shares the selected fields.
5. The employee can change the audience or revoke access later.

## 9. Scheduling and Today experience

### 9.1 Design direction

The scheduling experience should feel simple, tangible, and calm. Light functional skeuomorphism may be used to make objects understandable, such as paper style task cards, familiar tabs, tactile controls, subtle shadows, and a visible timeline.

The interface must avoid faux leather, faux wood, heavy texture, excessive decoration, and visual clutter. Skeuomorphism should explain interaction, not imitate a physical office.

### 9.2 Default Today layout

The default layout contains:

1. **Now card:** one current task, its purpose, expected duration, and a Start control.
2. **Up next:** no more than three upcoming items.
3. **Day timeline:** meetings, focus blocks, breaks, and transition time.
4. **Unscheduled tray:** captured work that has not yet been placed.
5. **Quick capture:** a persistent way to record a task or thought without completing a form.

The user can switch between Day Cards, Timeline, and Week views. The chosen view should be remembered.

### 9.3 Task breakdown

An AI generated task plan should use editable step cards. Each step can contain:

* A concrete action beginning with a verb.
* Why the step is needed.
* An estimated duration or duration range.
* Required inputs.
* Dependencies.
* Expected output.
* A definition of done.
* An optional energy or concentration level.

The user can merge, split, reorder, add, remove, or rewrite any step.

### 9.4 Schedule proposals

The application should normally offer two or three options rather than silently choosing one. For example:

* Earliest completion.
* Lowest context switching.
* Balanced workload.

Every option must explain its reasoning in plain language. Proposals must respect work hours, existing events, focus windows, breaks, transition buffers, quiet hours, and the user’s preferences.

### 9.5 Execution states

A task can move through the following user controlled states:

1. Planned.
2. Ready.
3. In progress.
4. Paused.
5. Completed.
6. Rescheduled.
7. Returned to plan.

The application should preserve context when a task is interrupted. A short Resume note can record what was completed, what remains, and what to open next.

## 10. Communication and idea reframing

### 10.1 Product form

Clarify should be a structured workspace rather than a generic chatbot. It accepts pasted text, typed thoughts, uploaded text, and optional voice transcription. Connected workplace messages can be added in a later release.

### 10.2 Transformation modes

The user can choose:

* **Make explicit:** reveal requests, dates, owners, implied dependencies, and missing context.
* **Break down:** turn a request or idea into ordered steps.
* **Help me say this:** draft a clear, respectful message while preserving the user’s intent.
* **Show as cards:** divide information into editable units.
* **Show as a mind map:** display relationships between topics, questions, actions, and decisions.
* **Prepare a conversation:** organize the goal, key points, questions, boundaries, and possible outcomes.

### 10.3 Standard result

Where applicable, the result should use the following cards:

1. **Original:** the unmodified source.
2. **What it appears to mean:** clearly labeled as an interpretation.
3. **What is required:** requested actions, outputs, owners, dates, and constraints.
4. **What is unclear:** ambiguity, conflicting information, and missing context.
5. **What I can ask:** editable clarification questions.
6. **What happens next:** an editable sequence of actions.

Each generated card must retain a link to the source text that supports it. A mind map must also have an equivalent hierarchical outline for keyboard and screen reader users.

### 10.4 Output controls

The user can:

* Edit any generated content.
* Compare original and transformed versions.
* View assumptions and confidence warnings.
* Regenerate one card without replacing accepted work.
* Undo changes and restore earlier versions.
* Convert selected cards into tasks or meeting agenda items.
* Export or copy a selected result.
* Report a harmful, inaccurate, or unhelpful result.

## 11. Meeting support

### 11.1 Before the meeting

The meeting plan should make the following explicit:

* Purpose.
* Desired outcome.
* Participant role.
* Expected contribution.
* Agenda and time allocation.
* Preparation steps and reading time.
* Decision owner.
* Required materials.
* Transition time before and after the meeting.

If important information is absent, the application should offer a concise message asking the organizer for clarification.

### 11.2 During the meeting

The optional focus view should show:

* The current agenda item.
* Time remaining.
* Relevant preparation notes.
* A private notes area.
* A parking lot for unrelated topics.
* Quick prompts for asking for clarification, processing time, repetition, or a written follow up.
* Manual controls to record a decision, action, or open question.

### 11.3 After the meeting

The application should separate:

1. Decisions.
2. Actions, including owner and time expectation.
3. Open questions.
4. Private notes.

The user must review and edit any AI generated summary before it can be shared. Approved actions can be added to the task plan and schedule.

Live recording and automated transcription are outside the initial release. They may be considered only after a clear consent, notification, retention, and deletion model is validated.

## 12. Working Guide and knowledge repository

### 12.1 My Working Guide

The Working Guide is employee controlled. It does not require a diagnosis and should never be treated as a performance profile.

Suggested fields include:

* Preferred communication format.
* Preferred amount of context.
* Helpful feedback style.
* Meeting participation needs.
* Focus hours and interruption preferences.
* How urgency should be communicated.
* Helpful document or information formats.
* Useful ways to confirm understanding.
* Optional identity or accommodation information.

Each field has its own visibility setting:

1. Private.
2. Selected people.
3. Team.
4. Organization.

Before sharing, the employee must be able to preview the exact result for each audience. Access can be changed or revoked later.

### 12.2 Knowledge repository

The repository is for all colleagues and may contain:

* Inclusive communication guidance.
* Meeting templates.
* Examples of explicit requests and useful feedback.
* Manager guidance.
* Organization policies.
* Accommodation and support routes.
* Definitions and frequently asked questions.

Every published article must have an owner, source, last reviewed date, and next review date. AI answers based on organization content must cite the relevant article and version.

## 13. Functional requirements

Priority meanings:

* **P0:** required for a safe pilot.
* **P1:** required for general release.
* **P2:** valuable later enhancement.

### 13.1 Scheduling requirements

| ID | Priority | Requirement | Acceptance condition |
| --- | --- | --- | --- |
| SCH01 | P0 | Connect one supported workplace calendar | User can authorize, view, disconnect, and see connector scope |
| SCH02 | P0 | Present a unified day view | Meetings, focus blocks, breaks, and tasks appear in one readable view |
| SCH03 | P0 | Capture work quickly | User can capture text from any primary screen without completing a full form |
| SCH04 | P0 | Break work into editable steps | Output includes actions, durations, dependencies, outputs, and definitions of done |
| SCH05 | P0 | Offer schedule options | User receives two or three explained options when more than one arrangement is viable |
| SCH06 | P0 | Require approval for calendar writes | No external calendar item is created or changed before explicit confirmation |
| SCH07 | P0 | Support execution controls | User can start, pause, resume, complete, reschedule, and return a task to the plan |
| SCH08 | P0 | Support preparation and transition buffers | Buffers can be set globally and changed per event |
| SCH09 | P0 | Respect notification and quiet hour preferences | Reminders do not violate the configured quiet period |
| SCH10 | P0 | Provide keyboard alternatives | Every pointer interaction, including drag and drop, has a keyboard operation |
| SCH11 | P1 | Preserve interruption context | User can save and later see a Resume note |
| SCH12 | P1 | Learn duration preferences with consent | Learning is opt in, explainable, editable, and resettable |

### 13.2 Communication requirements

| ID | Priority | Requirement | Acceptance condition |
| --- | --- | --- | --- |
| COM01 | P0 | Accept supported source formats | User can enter typed or pasted text and retain the original source |
| COM02 | P0 | Provide explicit transformation modes | User chooses the intended transformation before generation |
| COM03 | P0 | Show source and output together | The original remains accessible throughout review and editing |
| COM04 | P0 | Detect and expose ambiguity | Missing owners, dates, outputs, terms, or constraints appear under What is unclear |
| COM05 | P0 | Generate editable cards | Each card can be edited independently and links back to supporting source text |
| COM06 | P0 | Provide accessible mind maps | Every visual map has a synchronized hierarchical outline |
| COM07 | P0 | Draft clarification questions | Questions are editable and cannot be sent without approval |
| COM08 | P0 | Preserve user intent | User can specify tone, audience, phrases to keep, and phrases to avoid |
| COM09 | P0 | Provide history and undo | User can restore an earlier accepted version |
| COM10 | P0 | Convert outputs to work objects | Selected content becomes a task, agenda item, question, or note with provenance |
| COM11 | P1 | Read content aloud | Playback has speed, pause, resume, and stop controls |
| COM12 | P2 | Import connected messages | User can deliberately import selected Slack or Teams content after connector approval |

### 13.3 Meeting requirements

| ID | Priority | Requirement | Acceptance condition |
| --- | --- | --- | --- |
| MTG01 | P0 | Create a guided meeting plan | Plan covers purpose, outcome, agenda, role, preparation, and decision ownership |
| MTG02 | P0 | Clarify expected participation | User can record or request what contribution is expected |
| MTG03 | P0 | Schedule preparation and buffers | Approved time blocks appear in the user’s plan |
| MTG04 | P0 | Provide a meeting focus view | Current agenda item, timer, relevant notes, and quick prompts are available |
| MTG05 | P0 | Separate meeting outputs | Decisions, actions, questions, and private notes remain distinct objects |
| MTG06 | P0 | Convert approved actions into follow through | User can add reviewed actions to Today or a calendar |
| MTG07 | P1 | Provide reusable meeting templates | User can create and reuse personal or organization templates |
| MTG08 | P2 | Support consent based transcription | Recording cannot begin until the defined consent flow is satisfied |

### 13.4 Working Guide and knowledge requirements

| ID | Priority | Requirement | Acceptance condition |
| --- | --- | --- | --- |
| GUI01 | P0 | Create a Working Guide without diagnosis disclosure | All fields can be completed using preference language only |
| GUI02 | P0 | Set visibility per field | Each field can use a different audience setting |
| GUI03 | P0 | Preview an audience | User sees exactly what the selected person or group will receive |
| GUI04 | P0 | Revoke access | Updated permissions take effect without deleting the employee’s private source data |
| GUI05 | P0 | Search trusted guidance | Results identify title, owner, source, and review date |
| GUI06 | P0 | Cite repository sources in AI guidance | Generated guidance identifies the organization article and version used |
| GUI07 | P1 | Notify knowledge owners of review dates | Owners can see content approaching or past its review date |
| GUI08 | P1 | Provide inclusive templates | Colleagues can use reviewed request, feedback, agenda, and follow up templates |

## 14. User experience requirements

1. The primary navigation and major controls must remain consistent across modules.
2. Each screen must have one visually dominant primary action.
3. Advanced controls should be available through progressive disclosure.
4. Destructive, sharing, sending, and calendar changing actions require clear confirmation.
5. Buttons must use specific labels such as Add to calendar or Share with team rather than vague labels such as Continue.
6. The interface must distinguish facts, source text, user edits, and AI interpretations.
7. The application must save work continuously and explain whether content is private, shared, or published.
8. Users must be able to reduce animation, visual density, reminders, and the amount of information shown at once.
9. Empty states must explain the next useful action without requiring a tutorial.
10. Errors must preserve the user’s work and provide a recovery action.

## 15. Accessibility requirements

The target is WCAG 2.2 Level AA, supplemented by W3C guidance for cognitive and learning accessibility. Conformance is a baseline rather than the full definition of a usable neuroinclusive experience.

| ID | Priority | Requirement |
| --- | --- | --- |
| ACC01 | P0 | All core workflows are fully operable by keyboard |
| ACC02 | P0 | Focus is visible, logical, and restored correctly after dialogs or updates |
| ACC03 | P0 | Pages use semantic structure, meaningful labels, and useful screen reader announcements |
| ACC04 | P0 | Content reflows and remains usable at 200 percent zoom |
| ACC05 | P0 | Text, controls, icons, and focus indicators meet required contrast levels |
| ACC06 | P0 | Color is never the only way that meaning or status is conveyed |
| ACC07 | P0 | Reduced motion preferences are respected and nonessential motion can be disabled |
| ACC08 | P0 | Users can adjust text size, spacing, density, and preferred display font without loss of content |
| ACC09 | P0 | Drag, voice, audio, timer, and visual map interactions have equivalent alternatives |
| ACC10 | P0 | Navigation, help, terminology, and control placement remain consistent |
| ACC11 | P0 | Sessions, errors, and interruptions do not cause avoidable loss of work |
| ACC12 | P0 | Release testing includes paid participants with diverse neurodivergent access needs |

The default typography should use a highly legible system sans serif. Users may choose a familiar font or an accessibility oriented option such as Atkinson Hyperlegible. The product should not force a special dyslexia font or claim that one font works for every dyslexic person.

## 16. AI behavior and safeguards

### 16.1 Required behavior

1. Generate against defined schemas for interpretations, task plans, meeting outputs, and messages.
2. Preserve the source and record which source fragments support each generated object.
3. Label interpretations, assumptions, and uncertain statements.
4. Ask for missing information when a reliable output depends on it.
5. Keep previously accepted user edits unless the user explicitly replaces them.
6. Cite organization knowledge used in an answer.
7. Give the user controls to edit, regenerate, undo, and report output.
8. Require user confirmation before sending, sharing, publishing, or scheduling.

### 16.2 Prohibited behavior

The AI must not:

* Diagnose or infer a disability or health condition.
* Infer emotion, personality, honesty, motivation, or employee potential.
* Produce performance or productivity scores.
* Recommend employment decisions.
* Present a reframing as the only valid meaning of another person’s words.
* Reveal private information through a shared output or citation.
* Obey instructions contained inside imported documents or messages that conflict with the application’s permissions and policies.
* Train a shared model on customer content by default.

### 16.3 Evaluation

AI quality evaluation should measure:

* Factual consistency with the source.
* Correct extraction of owners, dates, outputs, and constraints.
* Appropriate detection of ambiguity.
* Preservation of user intent.
* Clarity and actionability.
* Unsupported inference rate.
* Harmful stereotype rate.
* User correction and rejection rate.
* Permission and data leakage resistance.

## 17. Privacy, security, and organizational trust

### 17.1 Data boundaries

The system must maintain distinct boundaries for:

1. **Private personal data:** prompts, thoughts, drafts, private notes, preferences, and unfinished plans.
2. **Shared collaboration data:** content deliberately shared with named people or groups.
3. **Organization published data:** approved knowledge, templates, and policies.

Managers and organization administrators must not be able to read private personal data merely because the organization pays for the account.

### 17.2 Requirements

| ID | Priority | Requirement |
| --- | --- | --- |
| PRV01 | P0 | New personal content is private by default |
| PRV02 | P0 | The intended audience and destination appear before sharing |
| PRV03 | P0 | Managers and administrators cannot access private user content |
| PRV04 | P0 | Calendar and communication connectors request the least privileges needed |
| PRV05 | P0 | Data is encrypted in transit and at rest |
| PRV06 | P0 | Tenants and permission scopes are isolated and tested |
| PRV07 | P0 | Sensitive actions create tamper resistant audit events |
| PRV08 | P0 | Application logs and analytics exclude private content and message bodies |
| PRV09 | P0 | Users can export and delete data within applicable organization and legal policies |
| PRV10 | P0 | A privacy impact, employment risk, accessibility, and security review is completed before pilot |

Retention choices must be explicit and configurable by data class. If the product is offered in Singapore, its design and deployment must be reviewed against the Personal Data Protection Act and current guidance from the Personal Data Protection Commission. Other launch regions require equivalent local review.

## 18. Organization administration

Administrators can:

* Configure single sign on and role based access.
* Enable approved calendar and communication connectors.
* Configure retention and regional data settings.
* Assign knowledge owners and review intervals.
* Publish approved templates and organization guidance.
* View aggregate adoption, reliability, and accessibility metrics.
* Review administrative and sharing audit events according to role.

Administrators cannot:

* Read private prompts, notes, drafts, or task plans.
* Compare individual productivity or completion rates.
* Infer health information from feature usage.
* Turn private content into organization knowledge without the owner’s explicit action.

## 19. Technical architecture

### 19.1 Components

| Component | Responsibility |
| --- | --- |
| Responsive web client and progressive web app | Accessible user interface, offline drafts, local state, notifications |
| Identity and tenancy service | Single sign on, multifactor authentication, roles, tenant isolation |
| Application API | Tasks, schedules, meetings, transformations, guides, permissions, and audits |
| Integration gateway | Google Calendar or Microsoft Graph initially, with Slack and Teams considered later |
| AI orchestration service | Templates, model routing, schema validation, retrieval, safety policy, and approval gates |
| Knowledge service | Article ingestion, ownership, versioning, review dates, search, and citations |
| Data services | Separate private, shared, and published data domains |
| Observability platform | Availability, latency, failures, safety signals, and privacy safe product metrics |

### 19.2 Architectural rules

1. Authorization is enforced by backend services, not only hidden in the client.
2. Every external write uses an idempotency key and records the approving user.
3. AI generated objects are validated against a schema before display or execution.
4. Retrieved content cannot change system permissions or execution rules.
5. Private content is excluded from logs, analytics payloads, and support diagnostics.
6. Shared objects record their owner, audience, source, version, and revocation state.
7. Draft work is recoverable after refresh, network interruption, or session expiry where security policy permits.

## 20. Core data objects

| Object | Important fields |
| --- | --- |
| PreferenceProfile | User, display settings, communication preferences, schedule preferences, consent choices |
| SourceArtifact | Owner, source type, original content, provenance, sensitivity, created time |
| Transformation | Source reference, mode, structured output, assumptions, model version, user edits, status |
| TaskPlan | Goal, steps, dependencies, estimates, definition of done, source references |
| TimeBlock | Task or event reference, start, end, buffer, calendar destination, approval state |
| MeetingPlan | Event, purpose, outcome, role, agenda, preparation, decisions, actions, questions |
| WorkingGuideField | Owner, field type, value, audience, version, revoked state |
| KnowledgeArticle | Owner, source, content, audience, version, last reviewed, next review |
| AuditEvent | Actor, action, object, destination, time, result, policy context |

## 21. Nonfunctional requirements

| Area | Requirement |
| --- | --- |
| Perceived performance | Primary navigation responds within one second under normal operating conditions |
| AI feedback | Generation shows progress or a useful state within two seconds |
| AI completion | Typical short transformations complete within eight seconds at the 95th percentile, excluding connector delays |
| Reliability | Calendar writes are idempotent and safely retryable |
| Resilience | Drafts survive common refresh, interruption, and transient network failure scenarios |
| Availability | General release target is 99.9 percent monthly availability, excluding published maintenance |
| Compatibility | Current stable versions of Chrome, Edge, Safari, and Firefox are supported |
| Auditability | Shared and externally written objects can be traced to source, version, approval, and actor |
| Privacy | Logs, traces, and analytics do not contain private content bodies |
| Maintainability | AI prompts, schemas, policies, and evaluation sets are version controlled and independently deployable |

## 22. Initial release scope

### 22.1 P0 pilot

The first safe pilot includes:

* Preference based onboarding.
* Today with Now, Up next, timeline, and quick capture.
* One calendar provider.
* AI task breakdown and explained schedule proposals.
* Communication reframing into structured cards.
* A basic mind map with synchronized outline.
* Meeting preparation, focus view, and manual meeting outputs.
* My Working Guide with field level permissions and audience preview.
* Searchable organization knowledge with ownership and citations.
* Permission controls, audit events, accessible alternatives, and recovery states.
* Privacy safe aggregate administration metrics.

### 22.2 Explicitly outside the pilot

* Live meeting recording or automated transcription.
* Direct Slack or Teams message import.
* Autonomous sending, publishing, or calendar changes.
* Employee monitoring, productivity scores, or individual manager dashboards.
* Diagnosis screening or medical advice.
* Automated accommodation decisions.
* Organization wide analysis of private user content.

## 23. Success measures

Success should be measured by whether users gain clarity and control, not by how much activity the application can observe.

| Measure | Definition |
| --- | --- |
| Completed clarity loop | User moves from captured source to an accepted action, plan, or clarification question |
| Time to first accepted step | Time from starting a breakdown to accepting or editing a usable first action |
| Clarification usefulness | Percentage of clarification drafts accepted or edited and used |
| Correction rate | Percentage of generated objects materially corrected or rejected |
| Meeting readiness | User reported confidence that purpose, role, and preparation are clear before a meeting |
| Follow through clarity | Percentage of reviewed meeting actions with an owner and time expectation |
| Perceived clarity | User reported change in understanding before and after a workflow |
| Trust | Percentage of users who agree that they understand what is private and what will be shared |
| Accessibility task completion | Successful completion of critical workflows by participants using diverse access methods |
| Reliability | Successful connector operations and recoverable failure rate |

Organization reporting should use minimum cohort sizes and aggregate trends. It must not expose individual use patterns or create comparisons between employees.

## 24. Pilot acceptance scenarios

### Scenario 1: Ambiguous request

Given an employee pastes an ambiguous workplace request, when they select Make explicit, then the application preserves the original, separates known requirements from uncertainty, and proposes editable clarification questions without inventing missing facts.

### Scenario 2: Plan and schedule

Given an employee approves an interpreted request, when they select Break down and Schedule, then the application creates editable steps, explains schedule options, and writes nothing to the external calendar until the employee confirms.

### Scenario 3: Meeting preparation

Given a meeting invitation has no purpose or expected contribution, when the employee opens its meeting plan, then the application identifies the missing information and offers an editable message requesting it.

### Scenario 4: Meeting closure

Given an employee records meeting outputs, when the meeting ends, then decisions, actions, questions, and private notes remain separate and no summary is shared before review.

### Scenario 5: Working Guide permissions

Given an employee has fields with different audiences, when they preview the guide as a manager, teammate, and organization member, then each preview contains only the fields permitted for that audience.

### Scenario 6: Accessible operation

Given a keyboard and screen reader user, when they complete capture, reframing, scheduling, and sharing workflows, then every action is available without pointer input and all status changes are announced meaningfully.

### Scenario 7: Privacy boundary

Given an organization administrator opens administration tools, when they inspect usage and audit information, then no private prompt, note, draft, task body, or diagnosis related inference is available.

### Scenario 8: AI uncertainty

Given the source does not specify an owner or deadline, when AI creates an interpretation, then those fields are marked unknown and the application asks rather than invents.

## 25. Recommended delivery sequence

1. Establish private data boundaries, roles, permissions, consent records, and audit design.
2. Build source capture and structured communication transformations.
3. Build task planning, Today, interruption recovery, and scheduling proposals.
4. Integrate one calendar provider with approval and idempotency controls.
5. Add the meeting lifecycle.
6. Add the Working Guide and governed knowledge repository.
7. Complete accessibility, AI quality, privacy, security, and operational release gates.

Accessibility and privacy testing must run throughout delivery rather than being postponed to the final stage.

## 26. Open product decisions

1. Which buyer and pilot group should be served first: a single team, an accessibility program, a distributed knowledge workforce, or another segment?
2. Which calendar provider should be supported first?
3. Should the brand explicitly lead with neurodiversity or present universal workplace clarity with neuroinclusive design?
4. Who owns an employee’s private workspace when the employer pays for the account?
5. Can a user take their Working Guide and private artifacts with them when leaving an organization?
6. Which data regions, model providers, and retention periods are acceptable to pilot customers?
7. Which actions require organization approval in addition to individual user approval?
8. How will a paid, diverse neurodivergent advisory group participate in research, prioritization, and release decisions?

## 27. Research and validation plan

Research should include people with varied communication, sensory, executive function, reading, motor, and assistive technology needs. Participants should be paid for their expertise.

The first validation rounds should test:

1. Whether the product reduces ambiguity without oversimplifying meaning.
2. Whether cards and mind maps help users understand and act.
3. Whether the scheduling interface feels calming rather than controlling.
4. Whether users understand privacy and sharing boundaries before acting.
5. Whether a Working Guide feels empowering rather than exposing.
6. Whether meeting support helps without increasing preparation burden.
7. Whether neurotypical colleagues can use the guidance without treating one preference as universal.

## 28. Reference standards and guidance

These sources should inform design and governance. Legal and accessibility specialists should confirm the requirements for each launch region and deployment.

* [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
* [W3C Cognitive and Learning Disabilities Accessibility Task Force guidance](https://www.w3.org/WAI/standards-guidelines/coga/)
* [GOV.UK accessibility requirements for public sector websites and apps](https://www.gov.uk/guidance/accessibility-requirements-for-public-sector-websites-and-apps)
* [UK Department for Work and Pensions neurodiversity guidance](https://www.gov.uk/government/publications/neurodiversity-at-work-guidance)
* [Singapore Personal Data Protection Commission](https://www.pdpc.gov.sg/)

## 29. Definition of ready for pilot

The application is ready for a controlled pilot only when:

1. Every P0 requirement has an owner and passing acceptance evidence.
2. Critical workflows have been tested with paid neurodivergent participants and assistive technology users.
3. Private content is inaccessible to managers and administrators in both interface and API tests.
4. External actions require review and explicit approval.
5. AI evaluations meet agreed thresholds for source consistency, uncertainty handling, and harmful output.
6. Calendar failure and retry behavior has been tested without duplicate events.
7. Accessibility, privacy, security, employment risk, and legal reviews have no unresolved critical findings.
8. Support, incident response, deletion, export, and connector revocation procedures are documented.
