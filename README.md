# Bonjou Web

The Bonjou marketing website and browser app for encrypted chat and file sharing.

- [Open Bonjou](https://bonjou.vercel.app)
- [CLI and relay source](https://github.com/bonjou-app/bonjou-cli)
- [Bonjou organization](https://github.com/bonjou-app)

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

To exercise a local relay, run this from the CLI repo:

```sh
go run ./cmd/bonjou-relay -origins http://127.0.0.1:5173,http://localhost:5173 -trust-proxy=false
```

Then run `npm run smoke` here. To point the browser at the local relay, copy
`.env.example` to `.env.local` before starting Vite. The smoke test creates two synthetic peers and
checks key exchange, approval, and encrypted streaming. Set `RELAY` to test
another relay you operate.

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

Treat `VITE_*` configuration and browser bundles as public. Store service
credentials in deployment secret storage; keep end-to-end encryption keys on
clients. The Go relay forwards opaque content and has a separate deployment.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md), and
[SECURITY.md](SECURITY.md). The source uses the [MIT license](LICENSE).

This repository preserves the history of `website/` extracted from
`hamzaabdulwahab/bonjou-cli` at `a6e7e29270fa39c6aaa83118c8917dbc883ba1b1`.
