# SkinsCasa

Minimal desktop app for the dashboard Steam-link flow.
This subtree is intended to be extracted into a separate public repo named `SkinsCasa Helper`.
The desktop app name remains `SkinsCasa`.

## Development

```bash
npm install
npm start
```

This launches the Electron desktop app and its local loopback bridge on `http://127.0.0.1:47610`.

Server-only mode for debugging:

```bash
npm run start:server
```

## Build installers

```bash
npm run dist
```

This uses `electron-builder` and is configured for:

- macOS: universal `SkinsCasa-macOS.dmg`
- Windows: `SkinsCasa-Windows.exe`

Tagging a version (`v*`) runs the GitHub Actions release workflow and publishes both
installer assets to GitHub Releases.

Optional env vars:

- `STEAM_LINK_HELPER_HOST`
- `STEAM_LINK_HELPER_PORT`

## Use

1. Install the release for your operating system.
2. Open it from the dashboard through `skinscasa://open` or start the app normally.
3. In dashboard settings, prepare a Steam link handoff.
4. The app window will focus and show the Steam QR code.
5. Scan the QR code in Steam Mobile and approve the login.
6. The app posts the refresh token to the existing `/api/steam-link/redeem` route.

## Backend Contract

See [CONTRACT.md](./CONTRACT.md).

## Extraction From The Private Web Repo

This folder is structured to be split out with git history intact.

From the private dashboard repo:

```bash
npm run skinscasa-helper:split
```

Commit or stash first. The split command refuses to run on a dirty worktree.

That creates a branch containing only this app subtree. Push that branch to the
public repo named `SkinsCasa Helper`.
