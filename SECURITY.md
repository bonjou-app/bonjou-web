# Security

Report suspected vulnerabilities through
[GitHub's private vulnerability reporting](https://github.com/bonjou-app/bonjou-web/security/advisories/new).
Include affected revisions, reproduction steps using synthetic data, and the
impact. Do not include real private keys, access tokens, or user payloads in
public issues.

The protocol fixture contains intentionally public test keys. Its X25519
examples come from RFC 7748 section 6.1. They are not runtime credentials.

The browser generates session keys on the client. The relay forwards opaque
payloads; its source and protocol documentation live in
[bonjou-cli](https://github.com/bonjou-app/bonjou-cli). Encryption does not protect
against a compromised client, malicious delivered JavaScript, or unverified
peer identities. Shared protocol vectors verify crypto compatibility, not
complete CLI-to-browser transport support.
