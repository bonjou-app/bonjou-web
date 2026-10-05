<p align="center">
  <img src="public/brand/bonjou-mark.svg" alt="Bonjou logo" width="96" height="96" />
</p>

# Bonjou Web

The Bonjou marketing website and browser app for encrypted chat and file sharing.

- [Open Bonjou](https://bonjou.vercel.app)
- [CLI and coordinator source](https://github.com/bonjou-app/bonjou-cli)
- [Bonjou organization](https://github.com/bonjou-app)

The homepage includes a hands-on local handoff lab, three selectable sharing
stories, a browser/CLI setup explorer, and original paper-and-ribbon artwork.
The lab opens two endpoints in the same browser only after approval, verifies
received bytes, and offers an explicit download. It does not test another device
or start a Bonjou session. The setup check tests local browser capabilities
without opening a connection.

The workspace lets users pick, drop, or paste files into a staging tray, review
them, choose recipients, and explicitly offer them. Recipients approve before
payload streaming; downloaded bytes are authenticated and verified.

## Development

Use Node.js 24.x. This repository builds independently; no parent
repository, submodule, or Go checkout is needed for the web build.

```sh
npm ci
npm run dev
```

The same application serves the marketing page at `/`, the workspace at `/app`,
and room links at `/r/{code}`. `/share` remains a compatibility route.

## Verification

```sh
npm run check:protocol
npm test
npm run build
```

`check:protocol` checks the fixture checksum and compares it with the canonical
Go fixture at the exact public commit in
[`protocol-source.json`](src/share/vectors/protocol-source.json). It needs
network access. For an offline comparison with a local CLI checkout:

```sh
npm run check:protocol -- /path/to/bonjou-cli
```

To exercise a local coordinator, run this from the CLI repo:

```sh
go run ./cmd/bonjou-relay -origins http://127.0.0.1:4173 -trust-proxy=false
```

Then run `APP_ORIGIN=http://127.0.0.1:4173 npm run smoke` here. To point the browser at the local coordinator, copy
`.env.example` to `.env.local` before starting Vite. The smoke test checks source-network discovery,
room isolation, encrypted signaling, and rejection of payload endpoints. Set
`COORDINATOR` and `APP_ORIGIN` to test another coordinator you operate with the
real website origin. `RELAY` remains a smoke-test configuration alias; browser
builds use `VITE_COORDINATOR_URL`.

For the complete sequential browser suite, build and start a preview:

```sh
VITE_COORDINATOR_URL=http://127.0.0.1:46330 npm run build
npm run preview -- --port 4173 --strictPort
```

Then run `npm run e2e:all`. Install its browser runtimes with
`npx playwright install chrome webkit` first (`--with-deps` on Linux).
Set `APP_URL` and allow that exact origin in the coordinator's `-origins` flag.
Run coordinator-backed suites one at a time: their peers share a discovery
network. `E2E_REPORT_DIR` controls where logs, screenshots, and `results.json`
are saved. The full runner defaults its smoke check to the local coordinator;
set `COORDINATOR` when testing another endpoint you operate.

The suite covers responsive UI, motion, direct sharing, session workflows,
accessibility, populated keyboard flows, connection loss, file staging, the
homepage lab and setup explorer, boundary failures, and mixed Chrome/WebKit
transfers. UI, motion, LAN, experience, and boundary checks run in both engines.
CI builds this web revision with a pinned signaling coordinator. Linux runs
Chrome flows plus WebKit UI/motion; macOS runs native WebKit and mixed-engine
sharing. Together the jobs cover the full suite, record runtime capabilities,
and save evidence. Hosted macOS browser checks use a disposable process with
local-network permission; normal local verification uses your ordinary account. The separate Web job checks protocol vectors, unit tests,
dependency audit, and the production build.

See the [comprehensive verification report](docs/superpowers/reports/2026-10-05-bonjou-comprehensive-e2e.md)
for results, corrected issues, retained failure evidence, and coverage limits.

## Protocol changes

The Go repository owns `internal/network/testdata/protocol-v2.json`. For a
protocol change, update both implementations with linked changes, regenerate the
Go vectors, and copy the fixture here. Record the reviewed Go commit and the
fixture SHA-256 in `protocol-source.json`, then run the checks above. The Go
repository also tests its candidate vectors against a pinned browser revision.

The keys and ciphertext in the fixture are public examples for tests, including
the X25519 examples in [RFC 7748 section 6.1](https://datatracker.ietf.org/doc/html/rfc7748#section-6.1).
The app generates its own keys at runtime. Do not use fixture keys for sessions.

## Deployment

Use the repository root as the Vercel project root. `vercel.json` defines
`npm ci`, `npm run build`, `dist`, the application routes, and service-worker
headers. Keep `bonjou.vercel.app` on the existing Vercel project when changing
the connected Git repository.

The existing Vercel project is connected to `bonjou-app/bonjou-web`. Pull
requests receive preview deployments, and merges to the protected `main` branch
deploy production after the required web CI passes. The Vercel GitHub app has
access to this repository only.

Treat `VITE_*` configuration and browser bundles as public. Store service
credentials in deployment secret storage; keep end-to-end encryption keys on
clients. The Cloudflare Workers Free adapter and portable Go coordinator both
forward opaque WebRTC signaling and deploy separately. This web revision uses
the signaling-only coordinator from
`bonjou-app/bonjou-cli`. Deploy and verify the coordinator before promoting
the web revision. Set the public `VITE_COORDINATOR_URL` to its HTTPS base URL
in the Vercel build environment. Application data
travels over direct WebRTC; the former relay upload/download endpoints are
not a fallback.

The build records the same public endpoint and source revision in
`coordinator-config.json`. Automated production checks require that revision
to match the deployment event, preventing results from being attributed to a
different deployment when the production alias changes.
After deployment, run `npm run check:production` (or set `APP_URL` for another
deployment). It reads that delivered configuration and tests health, room
creation/joining, network candidates, encrypted signaling and absent payload
endpoints with the actual website Origin. Startup health may retry for up to
90 seconds for hosting startup or maintenance; individual HTTP requests
and WebSocket opening have ten-second deadlines. Protocol failures are not
retried. `npm run check:ingress` verifies that forged source-IP headers are
rejected or keep the caller in its actual source-scoped room. The
production-sharing workflow runs these checks after successful
Vercel production deployments, then verifies discovery, chat, QR invites,
room isolation, transfer approval/decline, and exact downloaded bytes using
native Google Chrome. It saves browser evidence and can be dispatched manually.
For a held synthetic room on another internet egress, set
`CROSS_NETWORK_ROOM_CODE` when running `check:ingress`, or supply the manual
workflow input. The check requires exact `network_mismatch`, then verifies the
same peer can still join its own source-network room. An expired room or
transport error cannot count as successful isolation.
Local CI proves the application flows against its local coordinator; it does
not prove availability of the separately hosted production service.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md), and
[SECURITY.md](SECURITY.md). The source uses the [MIT license](LICENSE).

This repository preserves the history of `website/` extracted from
`hamzaabdulwahab/bonjou-cli` at `a6e7e29270fa39c6aaa83118c8917dbc883ba1b1`.
