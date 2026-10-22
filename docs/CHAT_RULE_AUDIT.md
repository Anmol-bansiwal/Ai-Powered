# Chat rule audit

What decides how a student message is handled, and why each fixed rule still
exists. Goal: keep rules only for closed, predictable cases; use the model for
open-ended language; take subjects, topics and sources from the database.

Request flow: `parseChatRequest` → `QueryUnderstandingService.understand`
(rules) → `AnswersService` (model decision when needed, database lookups,
search, evidence checks) → `chatReply`.

## Categories

- **Validation** — rejects or limits input. Always deterministic.
- **Fast path** — a small, closed set answered without a model call.
- **Database** — values come from approved questions, never from code.
- **Model** — open-ended language, read by the structured decision call.
- **Open list** — a hand-written list that tries to predict student wording.
  These are the rules being retired, one at a time, with an evaluation each.

## Where the model is used

| Situation | Model call |
| --- | --- |
| Follow-up in a conversation the rules cannot place (`make it shorter`, `definition` after `CO2`) | Decision (`transform_previous`, `new_question`, `clarify`, `out_of_scope`, `social`) |
| Short message that no paper mentions (`thanks bro`) | Decision |
| First message the rules cannot place | Decision, only when `CHAT_FIRST_TURN_DECISION=true` (off: no measured benefit) |
| Rework of the previous answer | Transform |
| Paper evidence / general explanation | Quote check, explain (unchanged) |

Model output is validated in code: unknown actions are rejected, subjects must
exist in the bank, cited question ids are reloaded from the database.

## Rules

### `src/questions/query-understanding.service.ts`

| Rule | Category | Purpose | Decision |
| --- | --- | --- | --- |
| `isEmptyOrUnusable`, `MAX_INPUT` | Validation | Empty, punctuation-only or over-long input | Keep |
| `GREETING_LOOSE` | Fast path | hi / hello / thanks without a model call | Keep |
| `AFFIRMATION` | Fast path | "yes" confirming our own "Did you mean X?" | Keep |
| `looksLikeGibberish` | Fast path | Keyboard mash, by vowel ratio (no word list) | Keep |
| `matchSubjectCatalogue`, `reliableSubjectsIn`, `unambiguousPrefixHit`, `editDistance` | Database | Subject names, typos and prefixes matched against bank subjects | Keep |
| `inferActiveSubject` | Database | Current subject from the filter or our last reply's metadata, checked against the bank | Keep |
| `pendingTopic`, `confirmedSubject`, `answeredTurn` | Fast path | Re-read the message our last reply answered (no reply-text parsing) | Keep |
| `looksLikeMathExpression` | Fast path | Formula-shaped input (θ, ^, =) goes to search, not to a subject menu | Keep |
| `CONCEPT_EXPLAIN`, `QUESTION_SEARCH`, `SOLVE_PROBLEM` | Telemetry | Only set the `kind` label; routing does not depend on them | Keep |
| `FOLLOW_UP` | Open list | 10 follow-up phrasings | Kept only as the fallback when the decision call is unusable |
| `looksLikeMultipleRequests` | Open list | Split on "and"; rejected "What is inflation and how does it affect consumers?" | **Removed** (change 1) |
| `PHRASE_FIXES` | Open list | Three Newton's-law spellings | **Removed** (change 3); the misspelling still retrieves the right paper |
| `isTrigTopicProbe` | Open list | Special-cased sin / cos / tan | **Removed** (change 4); a lone "sin" now goes to the bank topic lookup |
| `TOPIC_STEMS` | Guard | Stops "sin", "cos", "tan", "log" being read as an abbreviated subject name | Keep (not student wording) |

### `src/questions/query-intent.ts`

| Rule | Category | Purpose | Decision |
| --- | --- | --- | --- |
| `GREETING`, `CAPABILITIES` | Fast path | Greetings; "what can you do" | Keep |
| `isBareSubject`, `namedSubject`, `subjectAliases` | Database | Built from bank subjects; only the maths/business alias map is fixed | Keep |
| `VAGUE_STUDY`, `PAPER_BROWSE`, `YEAR_ONLY` | Fast path | "homework", "give me the 2024 paper", "last 3 years" — product behaviour, not wording guesses | Keep |
| `looksLikeBareTopic` | Fast path | Short message with no question shape → database topic lookup | Keep |
| `looksLikeUnrelatedRequest` | Open list | Hamlet, bitcoin, weather… | **Removed** (change 5); the model decision (mid-chat) or the explain model declining after an empty search (first message) replies out of scope |
| `ACADEMIC_SIGNAL` | Fast path | Question and instruction words (what, why, define, calculate…) | Keep — closed grammar set |
| Topic nouns in `ACADEMIC_SIGNAL` and `looksLikeEducationalRequest` | Open list | inertia, force, mole, algebra, sin… | **Removed** (change 6); formula symbols (θ π √ ∫ ^ =) kept |

### Network calls

| Rule | Category | Purpose | Decision |
| --- | --- | --- | --- |
| `fetchOpenAI` (`openai-fetch.ts`) | Validation | At most one retry, only after a dropped connection or a 5xx; never after a timeout or a 4xx (bad request, auth, quota, rate limit) | **Added** (change 2) |

## Evaluation

Each change is measured on the same 138 messages: a 38-turn conversation suite
and the 100 labeller-written queries in
`eval/edusearch_100_candidate_queries.labeled.json`, against the live model and
database. These are not independent student submissions; real student queries
remain the promotion gate for `CHAT_FIRST_TURN_DECISION`.

### Results (2026-10-21, `CHAT_FIRST_TURN_DECISION=false`, each change on top of the previous)

| | Conversation suite (38) | p50 / p95 | 80 study questions answered | 20 "unrelated": out-of-scope reply | OpenAI calls / chat tokens (138 msgs) |
| --- | --- | --- | --- | --- | --- |
| Baseline | 37/38 | 3.6 / 6.0 s | 79/80 (1 timeout) | 12 | 325 / 104k |
| 1. Multiple-requests rule removed | 38/38 | 4.3 / 9.0 s | 78/80 (2 network drops) | 11 | 325 / 105k |
| 2. One retry | 36/38 | 3.6 / 5.6 s | 79/80 (1 timeout) | 10 | 326 / 104k |
| 3. `PHRASE_FIXES` removed | 38/38 | 3.4 / 5.8 s | 79/80 (1 timeout) | 9 | 327 / 105k |
| 4. Trig list removed | 37/38 | 3.6 / 6.3 s | 79/80 (1 timeout) | 10 | 327 / 105k |
| 5. Unrelated list removed | 37/38 | 3.9 / 6.5 s | 79/80 (1 timeout) | 10 | 334 / 106k |
| 6. Topic nouns removed | 37/38 | 3.5 / 5.3 s | **80/80** | 10 | 336 / 108k |

Reading the numbers:

- Every conversation-suite miss is the same debatable turn: after an answer
  about CO2, "definition" is sometimes treated as "rework that answer" rather
  than a new search. Both replies are correct definitions.
- No valid study question was called off-topic in any run.
- The "unrelated" group varies between 9 and 12 between runs with no relevant
  code change. These are borderline school topics (French Revolution, DNS,
  Pride and Prejudice); whether to answer them is a product decision, not a
  routing bug.
- Removing the unrelated-question list (change 5) costs about 3 extra model
  calls per 138 messages, because off-topic first messages now need one
  search and one explain call to be recognised.
- Timeouts: a few long physics problems occasionally exceed the 20-second
  answer timeout (CAND-041, CAND-051). Timeouts are deliberately not retried.

Live spot checks after changes 4 and 6: "sin", "cos", "force", "inertia",
"mole", "algebra" and "velocity" sent alone are routed to the right subject
by the bank topic lookup and answered (Physics, Chemistry or Mathematics).
