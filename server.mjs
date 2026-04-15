import { randomUUID } from "node:crypto";
import http from "node:http";

import QRCode from "qrcode";
import steamSession from "steam-session";

const { EAuthTokenPlatformType, LoginSession } = steamSession;

const DEFAULT_HOST = process.env.STEAM_LINK_HELPER_HOST?.trim() || "127.0.0.1";
const parsedPort = Number(process.env.STEAM_LINK_HELPER_PORT ?? process.env.PORT ?? "47610");
const DEFAULT_PORT = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 47610;
const SESSION_RETENTION_MS = 15 * 60 * 1000;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeDashboardUrl(value) {
  const parsed = new URL(String(value).trim());

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Dashboard URL must use http or https.");
  }

  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/+$/u, "");
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function resolveLaunch(dashboardUrl, token) {
  const response = await fetch(`${dashboardUrl}/api/steam-link/helper-launch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });

  const payload = await response.json().catch(() => ({}));

  if (
    !response.ok ||
    typeof payload.code !== "string" ||
    typeof payload.dashboardUrl !== "string"
  ) {
    throw new Error(payload.error || "Dashboard refused the Steam helper launch.");
  }

  return {
    code: payload.code.trim().toUpperCase(),
    dashboardUrl: normalizeDashboardUrl(payload.dashboardUrl),
  };
}

async function redeemRefreshToken(dashboardUrl, code, loginSession) {
  if (!loginSession.refreshToken) {
    throw new Error("Steam did not return a refresh token.");
  }

  const response = await fetch(`${dashboardUrl}/api/steam-link/redeem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
      refreshToken: loginSession.refreshToken,
      accountName: loginSession.accountName ?? undefined,
      steamId: loginSession.steamID?.getSteamID64?.() ?? undefined,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error || `Dashboard request failed with status ${response.status}.`,
    );
  }

  return payload;
}

function renderShell({ title, subtitle, body, autoRefresh, sessionId }) {
  const refreshScript =
    autoRefresh && sessionId
      ? `
  const sessionId = ${JSON.stringify(sessionId)};

  async function refreshSession() {
    try {
      const response = await fetch('/api/session?id=' + encodeURIComponent(sessionId), {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to load helper state.');
      }

      const session = await response.json();
      renderSession(session);

      if (session.status !== 'success' && session.status !== 'error') {
        window.setTimeout(refreshSession, 1000);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load helper state.';
      const statusValue = document.querySelector('[data-helper-status]');
      const messageValue = document.querySelector('[data-helper-message]');

      if (statusValue) {
        statusValue.textContent = 'Offline';
        statusValue.dataset.tone = 'error';
      }

      if (messageValue) {
        messageValue.textContent = message;
      }

      window.setTimeout(refreshSession, 1500);
    }
  }

  function renderSession(session) {
    const statusValue = document.querySelector('[data-helper-status]');
    const messageValue = document.querySelector('[data-helper-message]');
    const qrSlot = document.querySelector('[data-helper-qr]');
    const qrLink = document.querySelector('[data-helper-url]');
    const qrWrap = document.querySelector('[data-helper-qr-wrap]');
    const successWrap = document.querySelector('[data-helper-success]');
    const errorWrap = document.querySelector('[data-helper-error]');
    const errorValue = document.querySelector('[data-helper-error-text]');
    const accountValue = document.querySelector('[data-helper-account]');
    const steamIdValue = document.querySelector('[data-helper-steamid]');
    const returnLink = document.querySelector('[data-helper-return]');

    if (statusValue) {
      statusValue.textContent = session.status === 'success'
        ? 'Linked'
        : session.status === 'error'
          ? 'Failed'
          : session.status === 'saving'
            ? 'Saving'
            : session.qrSvg
              ? 'Awaiting approval'
              : 'Starting';
      statusValue.dataset.tone = session.status === 'success'
        ? 'success'
        : session.status === 'error'
          ? 'error'
          : 'neutral';
    }

    if (messageValue) {
      messageValue.textContent = session.message || '';
    }

    if (qrWrap) {
      qrWrap.hidden = !session.qrSvg;
    }

    if (qrSlot) {
      qrSlot.innerHTML = session.qrSvg || '';
    }

    if (qrLink) {
      if (session.qrUrl) {
        qrLink.textContent = session.qrUrl;
        qrLink.href = session.qrUrl;
      } else {
        qrLink.textContent = '';
        qrLink.removeAttribute('href');
      }
    }

    if (successWrap) {
      successWrap.hidden = session.status !== 'success';
    }

    if (errorWrap) {
      errorWrap.hidden = session.status !== 'error';
    }

    if (errorValue) {
      errorValue.textContent = session.error || '';
    }

    if (accountValue) {
      accountValue.textContent = session.accountName || 'Unknown account';
    }

    if (steamIdValue) {
      steamIdValue.textContent = session.steamId || 'Unknown SteamID64';
    }

    if (returnLink && session.returnUrl) {
      returnLink.href = session.returnUrl;
      returnLink.hidden = false;
    } else if (returnLink) {
      returnLink.hidden = true;
    }
  }

  refreshSession();
`
      : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "SF Pro Text", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(86, 112, 255, 0.18), transparent 35%),
          radial-gradient(circle at bottom right, rgba(48, 184, 144, 0.16), transparent 38%),
          #091018;
        color: #f5f7fb;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }

      main {
        width: min(100%, 560px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 28px;
        background: rgba(7, 13, 21, 0.9);
        box-shadow: 0 30px 90px rgba(0, 0, 0, 0.42);
        padding: 28px;
        backdrop-filter: blur(18px);
      }

      h1 {
        margin: 0 0 10px;
        font-size: clamp(28px, 5vw, 40px);
        line-height: 1;
      }

      p {
        margin: 0;
        color: rgba(245, 247, 251, 0.72);
        line-height: 1.5;
      }

      .stack {
        display: grid;
        gap: 18px;
      }

      .card {
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.04);
        padding: 18px;
      }

      .meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: rgba(255, 255, 255, 0.08);
      }

      .badge[data-tone="success"] {
        background: rgba(57, 193, 114, 0.2);
        color: #95f0b5;
      }

      .badge[data-tone="error"] {
        background: rgba(255, 107, 107, 0.18);
        color: #ffb2b2;
      }

      .qr-wrap {
        display: grid;
        gap: 14px;
        justify-items: center;
      }

      .qr {
        width: min(100%, 264px);
        aspect-ratio: 1;
        display: grid;
        place-items: center;
        border-radius: 24px;
        background: white;
        padding: 18px;
      }

      .qr svg {
        width: 100%;
        height: auto;
      }

      .action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 14px;
        padding: 12px 16px;
        text-decoration: none;
        background: rgba(77, 141, 255, 0.22);
        color: #dce9ff;
      }

      a {
        color: #9dccff;
      }

      code {
        display: inline-block;
        max-width: 100%;
        overflow-wrap: anywhere;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.26);
        color: #dbe8ff;
      }

      [hidden] {
        display: none !important;
      }
    </style>
  </head>
  <body>
    <main class="stack">
      <header class="stack">
        <div class="meta">
          <div class="badge" data-helper-status data-tone="neutral">Ready</div>
          <div class="badge">Desktop app</div>
        </div>
        <div class="stack" style="gap: 10px;">
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
      </header>

      ${body}
    </main>
    <script>
${refreshScript}
    </script>
  </body>
</html>`;
}

function renderLandingPage(origin) {
  return renderShell({
    title: "SkinsCasa",
    subtitle:
      "Keep this desktop app running locally, then start Steam linking from the dashboard settings page.",
    body: `
      <section class="card stack">
        <p>This app exposes a local loopback bridge on <code>${escapeHtml(origin)}</code>. It never binds to a public interface.</p>
        <p>When the dashboard sends a handoff to this app, the Steam QR code appears here and the refresh token is posted back to the existing <code>/api/steam-link/redeem</code> route.</p>
      </section>
    `,
  });
}

function renderLaunchPage(sessionId) {
  return renderShell({
    title: "Link Steam locally",
    subtitle:
      "Scan the QR code with Steam Mobile, then approve the login on your phone.",
    sessionId,
    autoRefresh: true,
    body: `
      <section class="card stack">
        <div class="meta">
          <strong>Current step</strong>
          <span data-helper-message>Preparing Steam login.</span>
        </div>
      </section>

      <section class="card stack qr-wrap" data-helper-qr-wrap hidden>
        <div class="qr" data-helper-qr></div>
        <p>Fallback URL:</p>
        <a data-helper-url rel="noreferrer" target="_blank"></a>
      </section>

      <section class="card stack" data-helper-success hidden>
        <strong>Steam linked.</strong>
        <p>Account: <span data-helper-account></span></p>
        <p>SteamID64: <span data-helper-steamid></span></p>
        <a class="action" data-helper-return href="#" hidden>Open dashboard settings</a>
      </section>

      <section class="card stack" data-helper-error hidden>
        <strong>Steam link failed.</strong>
        <p data-helper-error-text></p>
      </section>
    `,
  });
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}

function sendJson(response, statusCode, payload, cors = false) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(cors ? { "Access-Control-Allow-Origin": "*" } : {}),
  });
  response.end(JSON.stringify(payload));
}

export async function startSteamLinkServer(options = {}) {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const origin = `http://${host}:${port}`;
  const sessions = new Map();

  function createSession() {
    const session = {
      id: randomUUID(),
      status: "starting",
      message: "Preparing Steam login.",
      error: null,
      qrSvg: null,
      qrUrl: null,
      accountName: null,
      steamId: null,
      returnUrl: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    sessions.set(session.id, session);
    return session;
  }

  function serializeSession(session) {
    return {
      id: session.id,
      status: session.status,
      message: session.message,
      error: session.error,
      qrSvg: session.qrSvg,
      qrUrl: session.qrUrl,
      accountName: session.accountName,
      steamId: session.steamId,
      returnUrl: session.returnUrl,
    };
  }

  function updateSession(session, patch) {
    Object.assign(session, patch, { updatedAt: nowIso() });
    options.onSessionUpdated?.(serializeSession(session));
  }

  function cleanupExpiredSessions() {
    const now = Date.now();

    for (const [sessionId, session] of sessions.entries()) {
      if (now - Date.parse(session.updatedAt) > SESSION_RETENTION_MS) {
        sessions.delete(sessionId);
      }
    }
  }

  async function runSteamLink(session, dashboardUrl, token) {
    try {
      updateSession(session, {
        status: "starting",
        message: "Validating dashboard handoff.",
        error: null,
      });

      const launch = await resolveLaunch(dashboardUrl, token);
      const loginSession = new LoginSession(EAuthTokenPlatformType.SteamClient, {
        machineId: true,
        machineFriendlyName: "SkinsCasa Helper",
      });

      loginSession.loginTimeout = 5 * 60 * 1000;
      updateSession(session, {
        returnUrl: `${launch.dashboardUrl}/settings`,
        message: "Requesting Steam QR challenge.",
      });

      const authenticated = new Promise((resolve, reject) => {
        loginSession.on("polling", () => {
          updateSession(session, {
            message: "Waiting for QR scan from the Steam mobile app.",
          });
        });

        loginSession.on("remoteInteraction", () => {
          updateSession(session, {
            message: "QR scanned. Approve the login on your phone.",
          });
        });

        loginSession.on("authenticated", resolve);
        loginSession.on("timeout", () => {
          reject(new Error("Steam login timed out."));
        });
        loginSession.on("error", (error) => {
          reject(error instanceof Error ? error : new Error("Steam login failed."));
        });
      });

      const qrResult = await loginSession.startWithQR();

      if (!qrResult.qrChallengeUrl) {
        throw new Error("Steam did not return a QR challenge URL.");
      }

      const qrSvg = await QRCode.toString(qrResult.qrChallengeUrl, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 264,
      });

      updateSession(session, {
        status: "waiting",
        message: "Scan the QR code, then approve the login in Steam Mobile.",
        qrSvg,
        qrUrl: qrResult.qrChallengeUrl,
      });

      await authenticated;

      updateSession(session, {
        status: "saving",
        message: "Saving Steam refresh token to the dashboard.",
      });

      const payload = await redeemRefreshToken(launch.dashboardUrl, launch.code, loginSession);

      updateSession(session, {
        status: "success",
        message: "Steam refresh token saved.",
        accountName: typeof payload.accountName === "string" ? payload.accountName : null,
        steamId: typeof payload.steamId === "string" ? payload.steamId : null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Steam link failed.";

      updateSession(session, {
        status: "error",
        error: message,
        message,
      });
    }
  }

  const server = http.createServer(async (request, response) => {
    cleanupExpiredSessions();

    if (!request.url) {
      sendJson(response, 400, { error: "Missing request URL." });
      return;
    }

    const url = new URL(request.url, origin);

    if (request.method === "GET" && url.pathname === "/") {
      sendHtml(response, 200, renderLandingPage(origin));
      return;
    }

    if (request.method === "GET" && url.pathname === "/session") {
      const sessionId = url.searchParams.get("id");
      const session = sessionId ? sessions.get(sessionId) : null;

      if (!session) {
        sendHtml(
          response,
          404,
          renderShell({
            title: "SkinsCasa",
            subtitle: "The local session could not be found.",
            body: `
              <section class="card stack">
                <p>Go back to the dashboard and start a new Steam link handoff.</p>
              </section>
            `,
          }),
        );
        return;
      }

      sendHtml(response, 200, renderLaunchPage(session.id));
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, origin }, true);
      return;
    }

    if (request.method === "GET" && url.pathname === "/link") {
      const token = url.searchParams.get("token");
      const dashboard = url.searchParams.get("dashboard");

      if (!token || !dashboard) {
        sendHtml(
          response,
          400,
          renderShell({
            title: "SkinsCasa",
            subtitle: "Missing dashboard or token.",
            body: `
              <section class="card stack">
                <p>Open this app from the dashboard so it receives a signed handoff token.</p>
              </section>
            `,
          }),
        );
        return;
      }

      const session = createSession();
      options.onSessionCreated?.(serializeSession(session));
      void runSteamLink(session, dashboard, token);
      sendHtml(response, 200, renderLaunchPage(session.id));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/session") {
      const sessionId = url.searchParams.get("id");
      const session = sessionId ? sessions.get(sessionId) : null;

      if (!session) {
        sendJson(response, 404, { error: "Steam helper session not found." }, true);
        return;
      }

      sendJson(response, 200, serializeSession(session), true);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/session") {
      try {
        const payload = await readJson(request);
        const token = typeof payload.token === "string" ? payload.token : "";
        const dashboard = typeof payload.dashboard === "string" ? payload.dashboard : "";

        if (!token || !dashboard) {
          sendJson(response, 400, { error: "dashboard and token are required." }, true);
          return;
        }

        const session = createSession();
        options.onSessionCreated?.(serializeSession(session));
        void runSteamLink(session, dashboard, token);
        sendJson(response, 201, { id: session.id }, true);
        return;
      } catch (error) {
        sendJson(
          response,
          400,
          {
            error: error instanceof Error ? error.message : "Invalid request body.",
          },
          true,
        );
        return;
      }
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      response.end();
      return;
    }

    sendJson(response, 404, { error: "Not found." }, true);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  console.log(`SkinsCasa Helper listening on ${origin}`);

  const cleanupTimer = setInterval(cleanupExpiredSessions, 60 * 1000);
  cleanupTimer.unref();

  return {
    origin,
    server,
    async close() {
      clearInterval(cleanupTimer);
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}
