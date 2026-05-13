---
type: concept
tags: [reliability, distributed-systems, api-design]
sources: []
related:
  - "[[patterns/retry]]"
  - "[[concepts/database-transactions]]"
updated: 2026-05-13
---

# Idempotency

*An operation is idempotent when applying it twice has the same observable effect as applying it once. In distributed systems, idempotency is the property that makes retries safe.*

| Concept | One-line |
|---|---|
| Idempotent | `f(f(x)) == f(x)` |
| Why it matters | Networks fail mid-request; retries are unavoidable; without idempotency, retries double-charge, double-write, double-send |
| Two flavors | **Naturally idempotent** (SET x = 5) vs **made idempotent with a key** (PAY with idempotency-key) |
| The hard part | Telling the receiver "this is the same request as before" reliably |

## Why it matters

Every distributed call has three outcomes: success, failure, and *unknown*. The unknown case — request sent, response lost — is where idempotency earns its keep. The client doesn't know whether the work happened, so it retries. If the operation isn't idempotent, the retry compounds the original action: two payments instead of one, two emails sent, two rows inserted.

You can avoid this by guaranteeing nothing ever fails (impossible) or by making the operation naturally safe to repeat. Idempotency is the latter.

## Naturally idempotent vs key-based

Some operations are idempotent by their shape. Setting a value to a constant (`SET x = 5`) is idempotent — running it twice doesn't change the result. Reads are idempotent. Deletes are idempotent (the second delete is a no-op).

Others aren't. `INSERT INTO orders` creates a new row each time. `POST /pay` creates a new charge. To make these idempotent, you attach an **idempotency key** — a client-generated unique identifier the server uses to recognize duplicate requests.

The server stores `(key → response)`. On a duplicate key, it returns the stored response instead of re-running the operation. Stripe popularized this pattern for payment APIs; it's now table stakes for any write API.

> **Gotcha:** the key has to be client-generated. If the server generates it, the client can't reproduce it on retry, and you lose the deduplication.

## How databases help

Unique constraints turn a non-idempotent INSERT into an idempotent one. `INSERT ... ON CONFLICT DO NOTHING` (Postgres) or `INSERT IGNORE` (MySQL) on a key column gives you idempotent inserts for free — the second insert silently no-ops.

For conditional writes, `ON CONFLICT DO UPDATE` with a `WHERE` clause lets you express "insert if new, update only if the existing row is in a state where update makes sense." This is how you build idempotent state transitions: a workflow that's already `complete` shouldn't be re-completed.

> **Gotcha:** `ON CONFLICT DO UPDATE` without a WHERE clause is *not* idempotent if the update changes state every call (e.g., bumping a counter, updating a timestamp). Add the WHERE.

## How message queues help

Most queues offer "at-least-once" delivery — messages can be delivered more than once. Consumers must therefore be idempotent. The two common strategies:

1. **Dedup table** — store processed message IDs; check before processing. Cheap, works anywhere.
2. **Idempotent handler logic** — the handler itself uses naturally-idempotent operations (UPSERT, SET).

Exactly-once delivery is mostly a marketing term. What you actually want is at-least-once delivery + idempotent consumers. The combination gives you "effectively once" semantics.

## What goes wrong

The two failure modes you'll hit:

**Partial idempotency.** The first half of an operation is idempotent (insert into orders), the second isn't (send email). Retry the operation and you double-send the email. Fix: separate the side effects into their own idempotent steps with their own keys.

**Key reuse across mutations.** Client uses the same idempotency key for two genuinely different requests. The server returns the cached response from request 1 for request 2. Fix: keys must be scoped to a specific request body, often by hashing the body into the key.

> **Gotcha:** time-bounded idempotency keys (TTLed dedup tables) are a tradeoff — too short and retries on slow clients miss the cache; too long and key collisions become more likely. 24h is a common default; tune to your retry budget.

## Where to apply it

If you have a write endpoint, it should be idempotent. The cost is one column and one check; the benefit is that you can retry safely from anywhere — clients, gateways, queue redrivers — without writing bespoke "did this already happen?" logic at every layer.

A useful heuristic: **every external write should have an idempotency key.** Internal writes within a transaction can rely on the transaction's atomicity; cross-system writes can't.

## Connections

- [[patterns/retry]] — idempotency is the precondition that makes retries safe
- [[concepts/database-transactions]] — atomicity gives you free idempotency within a transaction
- Distributed systems texts: "Designing Data-Intensive Applications" ch.8, "Patterns of Distributed Systems" — idempotent receiver
