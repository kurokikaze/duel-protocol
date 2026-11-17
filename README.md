# Duel protocol

Shared wire contract for Magi-Nation Duel clients, bots, and game servers.
This directory is a standalone package prepared for its own repository. It is
currently private and connected to sibling checkouts with `file:` dependencies.

| Entry point | Responsibility |
| --- | --- |
| `duel-protocol` | Client/server action, prompt, effect and message types |
| `duel-protocol/commands` | Engine-to-wire and wire-to-engine conversion; default export converts client commands |
| `duel-protocol/effects` | Shared expiration update for client views of continuous effects |

The contract depends on Moonlands domain types and constants, but never imports
Waystone, Bechamel, transport libraries, browser globals, or filesystem APIs.
The command adapter imports the engine and preserves the existing card-hiding
behavior. Keeping it in a separate entry point lets type-only consumers avoid
loading engine conversion code.

```sh
npm ci
npm run build
npm test
```

Node.js 18+ is required. Moonlands is a peer dependency; the host selects the engine
version. For local development this package uses the same v0.40.2 archive as
Waystone and Bechamel.

## Ownership and migration

Dependency direction:

```text
waystone -> bechamel -> moonlands
waystone ------------> moonlands
waystone -> duel-protocol -> moonlands
bechamel -> duel-protocol
triage   -> bechamel + duel-protocol + moonlands (future)
```

Moonlands owns game rules and engine actions. Duel-protocol owns serialized
messages and conversion, including player-specific visibility. Bechamel owns
decision making. Waystone owns UI, Tauri integration, and its local game host.
Triage will own batch simulation, scheduling, and server orchestration.