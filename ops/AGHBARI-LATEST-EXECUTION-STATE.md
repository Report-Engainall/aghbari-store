# Aghbari Commerce — Latest Execution State

**State updated:** 2026-10-10  
**Repository:** `Report-Engainall/aghbari-store`  
**Base/main last verified:** `a5f3924d30423f327b4c12fde8341daa446d682a`  
**Last source-inspected candidate before this state refresh:** `db20bd6503bc9d2b1ee15ff948bb140453f2efb6`  
**Working branch / PR:** `feat/integrated-ai-assistant` / [PR #4](https://github.com/Report-Engainall/aghbari-store/pull/4)  
**Resume protocol:** retrieve live main SHA, PR head SHA, changed file list and Actions conclusions before executing. This file's write itself changes branch HEAD, so never infer current HEAD from this stored value.

## Implemented in the active working branch (read back from GitHub)
- Dedicated Arabic RTL `/admin/ai/assistant` component integrated into App routing and shared AdminShell navigation.
- Assistant reads saved ai_reports/ai_alerts/ai_tasks using the active organization's ID; clears in-memory conversation when organization changes; latest implementation ignores stale responses.
- AI landing page links directly to the assistant.
- AI lists gained real loading/error/retry behavior and stale-read protection.
- Dashboard customer count corrected to the customers table; product/order counts are organization scoped; sample metrics are labelled; hard-coded healthy status removed.
- Static contract assertions added for assistant route, tenant scoping, organization-switch reset/stale-request defense, AI list error behavior and dashboard truthfulness.
- Persistent project memory and canonical master specification are now added as repository files; README links the control files and contract verification asserts their continued presence.
- Pricing UI now distinguishes backend load errors from empty rules, provides retry, guards create/toggle/delete handlers, and confirms destructive deletion.

## Verified (repository-content level only)
- GitHub readback confirms the changed code/docs exist in the working branch.
- The assistant's database reads explicitly include active organization scope.
- The assistant displays that no generative model is configured; it is a saved-record summarizer, not a functioning LLM.
- Branch comparison after canonical and pricing updates showed the feature branch ahead of main with no behind commits; refresh actual comparison because this state/progress write changes the head.

## Not proven / open
- Latest Build and SQL Migration Chain on the feature head have not reported PASS; past queries showed queued states and subsequent heads require fresh checks.
- No local `npm run build`, browser E2E, responsive/accessibility, live Supabase/RLS proof or production deploy performed by this connected GitHub-only execution.
- PR #4 has not merged to main. Production remains HOLD / NO TOUCH.
- Native/private AI inference runtime, sanitization pipeline, event graph, recommendation evidence/action cards, quota ledger and model governance are not yet implemented by the current assistant.
- Automatic backup/restore and isolated recovery drill are not proven.
- Full XLSX/PDF structured extraction/resumable chunks, import DQS acceptance, outbox worker/DLQ recovery and complete browser test matrix remain open.

## Exact next executable action
1. Inspect the current PR #4 HEAD and main SHA, changed files, Build and SQL Migration Chain conclusions. The latest previously inspected Actions results were queued, not passed.
2. Run the static contract script and full production build in an actual Node environment; fix any failure on the feature branch and rerun against the resulting exact SHA.
3. Do not merge while checks are queued/failed or required review/security evidence is missing.
4. Continue the next high-value gap from the canonical specification: inventory current backup capability and design a safe backup/restore control contract that cannot falsely label CSV export a full database backup. Then proceed to import/DQS acceptance, SSOT/Onyx, outbox/queues/search and private AI governance.
5. Update this state and the development ledger after each meaningful verified cycle.

## Do not repeat / do not do
- Do not rebuild from zero or delete screenshot files, specs, migrations, current modules or git history.
- Do not split AI into a separate product or send sensitive data to external LLMs by default.
- Do not use frontend-supplied organization IDs as authorization.
- Do not claim PASS on queued workflows, or production/browser/hosted database proof without evidence.
- Do not enable offline transactional order writing contrary to the current online-only rule.
- Do not show customer order/invoice amounts under the latest all-stage price-hiding policy.


## Latest instruction capture and execution update

- Persistent source index: `docs/canonical/AGHBARI-SOURCE-REQUIREMENTS-INDEX.md`.
- Canonical normalized specification: `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`.
- Start-of-session memory: `PROJECT_MEMORY.md`; all new instructions must be incorporated without silently deleting prior requirements.
- The master specification records the latest conflict decisions: AI remains integrated/local-private; customer amounts stay hidden throughout customer order/invoice views; transactional offline order writing remains parked; unsafe plaintext/reversible/shared-unsalted password comparison is prohibited pending security review.
- Screenshot references must be implemented once per screen family while preserving originals and their provenance.
- Pricing source inspection found existing SQL code for retail/wholesale/both rule targeting and base-price fallback. The current working branch adds UI error/retry and destructive confirmation/authorization plus source-contract assertions; passing SQL runtime proof remains pending.
