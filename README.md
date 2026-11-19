# Duel protocol

Shared wire contract for Magi-Nation Duel clients, bots, and game servers.
Repository: [kurokikaze/duel-protocol](https://github.com/kurokikaze/duel-protocol).
The package is currently private in npm terms. Compiled packages are distributed
as `.tgz` assets on GitHub Releases. Bechamel and Waystone consume the archive at
https://github.com/kurokikaze/duel-protocol/releases/download/0.1.0/duel-protocol-0.1.0.tgz.

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
triage   -> bechamel + duel-protocol + moonlands
```

Moonlands owns game rules and engine actions. Duel-protocol owns serialized
messages and conversion, including player-specific visibility. Bechamel owns
decision making. Waystone owns UI, Tauri integration, and its local game host.
The sibling [triage server](../triage/README.md) owns batch simulation, server
orchestration and MongoDB persistence.
