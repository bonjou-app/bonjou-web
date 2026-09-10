# Contributing

Use Node.js 24 or newer and install the locked dependencies with `npm ci`.
Read `AGENTS.md`, `PRODUCT.md`, and `DESIGN.md` before changing the app.

Keep changes focused. Run `npm run check:protocol`, `npm test`, and
`npm run build` before submitting a pull request. For UI changes, verify the
affected flow in a browser at desktop and mobile sizes, with keyboard access.
Include what changed and the checks you ran in the pull request.

Coordinate protocol changes with
[bonjou-cli](https://github.com/bonjou-app/bonjou-cli). Keep the fixture source
revision and checksum accurate. Public test keys are safe to commit; real user
keys, payloads, `.env` files, and logs are not.

Report vulnerabilities through [SECURITY.md](SECURITY.md).
