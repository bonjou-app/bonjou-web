# Bonjou Web repository guidelines

This is the canonical guidance for agents in this repository. `CLAUDE.md`
imports it. Apply relevant skills and engineering practices by default.

## Default Working Practices

- Treat relevant skills, sound engineering practices, security, and verification as defaults. The user should not need to repeat "use the best skills and guidelines" in each task.
- Before editing, inspect the working tree, applicable instructions, affected code, and relevant project docs. Preserve unrelated user changes. Check assumptions against the implementation.
- Select the smallest useful set of available skills and read their instructions. Use architecture/design guidance for structural work, security guidance for trust boundaries and secrets, frontend/accessibility guidance for UI work, and testing/deployment guidance for those tasks. Respect each skill's scope; do not load unrelated skills or introduce a new framework just because a skill mentions it.
- For substantial design changes, explain the problem, realistic options, recommendation, and compatibility impact before implementation. Routine fixes and documentation updates should stay proportional to the task.
- Carry authorized work through implementation and appropriate verification. Make routine, reversible decisions within scope; ask only for missing information that changes the outcome or authorization that has not been supplied. Do not ask again for approval already given. Prepare a concrete migration and its validation before requesting any remaining approval for repository transfers, visibility changes, or history rewrites.
- Use current primary documentation for platform behavior and security recommendations that may have changed. Distinguish verified facts, inferences, and proposals.
- Review touched code for security, error handling, maintainability, and platform impact. Keep changes focused; avoid speculative abstractions, unrelated refactors, and silent dependency upgrades.
- Match verification to the change: meaningful regression tests for behavior changes; both Go and browser protocol suites for protocol work; browser verification for UI changes. For documentation-only changes, check accuracy, links, and the diff without adding artificial tests. Report checks actually run and any gaps.
- Finish with the outcome, relevant files, verification results, and remaining decisions or limitations. State security findings with evidence and redact secret values. A clean scan does not prove that a repository contains no secrets.

## Repository and product boundaries

- This public repository contains the marketing site and browser app. Its sibling `bonjou-app/bonjou-cli` contains the Go CLI, Go relay, and canonical protocol vectors. Each repository builds independently; there is no required parent checkout or submodule.
- One React application serves `/`, `/app`, `/r/{code}`, and the `/share` compatibility route. Preserve the shared session and one active session per browser.
- Read `PRODUCT.md` and `DESIGN.md` for product language, tokens, themes, and accessibility. Keep design tokens in `src/share/tokens.css`; use existing components before adding dependencies.
- The relay is an opaque forwarding service. Never move client encryption keys, decryption, or user payload storage to the relay.

## Commands and verification

- `npm ci` installs the locked dependencies; use Node.js 24.x.
- `npm run dev` runs Vite on loopback.
- `npm run check:protocol` checks the recorded fixture checksum and the exact pinned Go revision over HTTPS. For local/offline work, append `-- /path/to/bonjou-cli`.
- `npm test` runs the browser tests; `npm run build` checks TypeScript and creates `dist/`.
- `npm run smoke` checks a relay running at `http://127.0.0.1:46330`; set `RELAY` to use another relay you operate. Start the relay from the CLI repository.
- For UI changes, verify affected routes and flows in a browser, including keyboard use, mobile layout, and both themes. Report any verification gaps.

## Protocol and security

- Protocol code lives in `src/share/crypto.ts`. Go owns `internal/network/testdata/protocol-v2.json`; this repo keeps the copy in `src/share/vectors/` and its provenance in `protocol-source.json`.
- Coordinate protocol changes across both repos. Regenerate the canonical Go fixture, copy it, update its reviewed source commit and SHA-256, and run protocol comparison, tests, and build. Never skip a missing or mismatched fixture.
- The fixed private keys, nonces, and derived keys in the fixture are intentionally public test data. The X25519 examples come from RFC 7748 section 6.1. Keep them out of runtime identity generation.
- Preserve metadata-first approval, envelope authentication, transfer limits, peer verification, and path handling. Do not claim CLI-to-browser transport support based only on shared crypto vectors.
- Treat browser bundles, public assets, source maps, and `VITE_*` values as public. Real passwords, password hashes, private keys, service credentials, and user data stay out of Git and build artifacts. Keep session encryption keys on clients and service credentials in deployment secret storage.
- Keep local `.env` and private key files ignored, with placeholder-only examples. Redact findings and keep scanner exceptions narrow. Revoke or rotate exposed real credentials; repository privacy does not undo a leak.
- Preserve the MIT license and attribution. `private: true` in `package.json` prevents npm publishing and does not make this source private.

## Deployment

- Deploy from the repository root using `vercel.json`; preserve its rewrites and service-worker headers.
- Use the existing Bonjou Vercel project and domain. Validate a preview before promoting it when changing deployment configuration.
- Keep fork-PR CI free of production secrets. Review dependency and GitHub Actions updates, and preserve immutable action/source pins.

## Links

- [README](README.md)
- [Contributing](CONTRIBUTING.md)
- [Design](DESIGN.md)
- [Product](PRODUCT.md)
- [Security](SECURITY.md)
