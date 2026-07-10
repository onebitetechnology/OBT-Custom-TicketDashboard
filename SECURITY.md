# Security

## Reporting

Do not open a public issue containing credentials, customer data, session cookies, or support bundles. Report a suspected vulnerability privately to `jeff@onebitetechnology.ca` and include the app version plus concise reproduction steps.

## Trust Boundaries

- The Electron renderer is sandboxed and has no Node.js access. Navigation, popups, permissions, and external links are denied unless explicitly allowlisted.
- Privileged Electron IPC accepts requests only from the active board's top-level loopback frame.
- The bundled HTTP server runs as an Electron utility process. Packaged builds disable `ELECTRON_RUN_AS_NODE`, Node CLI/environment injection, and extra `file://` privileges; they enable cookie encryption and embedded ASAR integrity enforcement.
- Local administrative APIs require a random per-process token and accept it only from a loopback socket using a loopback `Host` header.
- RepairDesk Ticket Counter and authenticated sync URLs must use HTTPS on `repairdesk.co` or one of its subdomains. URL credentials and nonstandard ports are rejected.
- Shared-board discovery exposes only board metadata. Shared settings require an HMAC-signed request with a private board key, a short timestamp window, and a one-time nonce.
- Shared-board traffic is not encrypted by the app itself. Use it only on a trusted private LAN, never port-forward the board server, and rotate the shared board key after a network compromise.

## Local Secrets

RepairDesk API keys, Ticket Counter tokens, session cookies, and shared-board keys are stored in the operating system user-data directory. Config writes are atomic, backups are rotated, and files are restricted to the current user on POSIX systems. Access to the Windows user profile should likewise be limited to the board account.

Support bundles summarize connection state and must not contain raw credentials. Treat support bundles as private operational data because they can include hostnames and local network paths.

## Release Integrity

Production packaging uses `forceCodeSigning: true`. GitHub Actions refuses to publish unless these repository secrets are configured:

- `MAC_CSC_LINK`
- `MAC_CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

The workflow verifies the hardened Electron fuse policy, macOS Developer ID signature, notarization ticket, Gatekeeper assessment, and Windows Authenticode signature before publishing. Release assets include `SHA256SUMS.txt` and a GitHub build-provenance attestation.

Every push to `main` and every pull request runs the same security preflight in a read-only GitHub Actions job with immutable action references.

Unsigned commands ending in `:local` are for local testing only and must not be published as production updates.

## Verification

Run the full local gate before release:

```bash
npm ci
bash ./preflight.sh
```

This checks JavaScript syntax, unit/integration tests, security smoke tests, dependency vulnerabilities, npm registry signatures, sensitive artifacts, workflow pinning, and mandatory signing controls.
