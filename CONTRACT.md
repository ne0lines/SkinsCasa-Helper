# SkinsCasa Helper Contract

This app is designed to live in a separate public repo named `SkinsCasa Helper`.

The private dashboard backend must provide these endpoints:

## `POST /api/me/steam-link-codes`

Authenticated dashboard route.

Response:

```json
{
  "code": "ABCDE-23456",
  "expiresAt": "2026-04-15T12:00:00.000Z",
  "helperDashboardUrl": "https://www.skins.casa",
  "helperLaunchToken": "signed_token"
}
```

## `POST /api/steam-link/helper-launch`

Request:

```json
{
  "token": "signed_token"
}
```

Response:

```json
{
  "code": "ABCDE-23456",
  "dashboardUrl": "https://www.skins.casa",
  "expiresAt": "2026-04-15T12:00:00.000Z"
}
```

## `POST /api/steam-link/redeem`

Request:

```json
{
  "code": "ABCDE-23456",
  "refreshToken": "steam_refresh_token",
  "accountName": "optional",
  "steamId": "optional"
}
```

Expected behavior:

- redeem is single-use
- backend validates the handoff code
- backend encrypts and stores the Steam refresh token

## Local App Expectations

- app listens on `127.0.0.1:47610` by default
- dashboard sends handoff to `POST /api/session` on the local app
- app starts Steam QR login locally via `steam-session`
- app never contains backend secrets
