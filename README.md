# Agent Invocation Replay Lab

**Replay the request. Understand the decision.**

A free, offline agent engineering sandbox that deterministically replays fictional tool requests through capability, approvals, time, idempotency, revocation and per-session cost-unit controls. It makes disagreements and failure states visible without executing any agent tools.

**Live public browser demo:** https://esheenj.github.io/agent-invocation-replay-lab/

## What you can try

Use the interactive JSON workbench in the browser, or run locally with Node.js 20+:

```bash
git clone https://github.com/esheenj/agent-invocation-replay-lab
cd agent-invocation-replay-lab
npm test
npm run demo
npm run build
```

For your own **fictional** replay input: `node src/cli.mjs path/to/scenario.json`. The input format is shown in `examples/scenario.json`. The CLI produces an explicit, machine-readable decision journal. Events are processed in supplied order, never silently sorted.

Each event has a unique `eventId`, `requestId`, `kind` (`approve`, `invoke`, `revoke`), `actor`, and timestamp with an explicit UTC offset. Invocations include a `tool` and non-negative `costUnits`. Approvals include `tool` and distinct `approvedBy`. Policy holds tool and actor allowlists, approval-required tools, a session budget, approval-age limit, and session end. The provided demo includes duplicate request handling, held approval, successful fictional approval, tool denial, budget hold and revocation.

## Interpretation

| Journal verdict | Meaning in this simulation |
| --- | --- |
| `ADMITTED_SIMULATION` | Fictional request passed the configured checks; **nothing executes** |
| `DUPLICATE_BLOCKED` | Same request ID was already admitted |
| `HELD_APPROVAL`, `STALE_APPROVAL` | Required matching prior approval missing or out of age |
| `HELD_BUDGET` | Simulated cumulative cost-unit cap would be exceeded |
| `ACTOR_DENIED`, `TOOL_DENIED` | Self-declared actor/tool not allowlisted |
| `OUT_OF_ORDER`, `EXPIRED_SESSION` | Supplied timestamp conflicts with ordered session policy |
| `REVOKED_REQUEST`, `REPLAY_REJECTED` | Previously revoked request or repeated event ID |

## Boundaries and limitations

This is a client-side educational simulation; it has **no remote worker, provider API, real agent enrollment, cryptographic identity, persistent ledger, real human approval, money movement, live trading or execution authority**. Cost units are arbitrary fictional integers, not billed currency. A browser reload resets state. Local or owner-supplied input assertions are not independently verified. A matching fictional approval does **not** grant real-world authority. For production control use, independently enforce durable, authenticated, transactional checks server-side.

Inputs max 1 MiB in the web UI/CLI; max 300 events. No runtime dependencies, analytics, accounts or extra recurring infrastructure cost. All source, tests and CI are published under MIT.

## Contributing

Issues and PRs are welcome. Supply synthetic, non-secret examples for any new scenario; do not share private agent prompts, credentials, user data, exchange integration code or production configuration.

**Voluntary support:** [reviewed Esheen Labs public funding page](https://esheenj.github.io/compound-intelligence-starter/support.html). Do not assume native GitHub Sponsors or fiat checkout is active. Donation destinations may be custodial exchange deposit addresses; always re-check the current network, address and minimum.

© 2026 Esheen Labs.
