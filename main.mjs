import { app, BrowserWindow, shell } from "electron";

import { startSteamLinkServer } from "./server.mjs";

const APP_ID = "com.skinscasa.steamlink";

let mainWindow = null;
let helperServer = null;
let helperOrigin = null;

function isLocalHelperUrl(value) {
  return Boolean(helperOrigin) && value.startsWith(helperOrigin);
}

async function createMainWindow() {
  if (!helperOrigin) {
    throw new Error("Steam link server is not ready.");
  }

  const window = new BrowserWindow({
    width: 560,
    height: 760,
    minWidth: 520,
    minHeight: 700,
    show: false,
    title: "SkinsCasa",
    backgroundColor: "#091018",
    autoHideMenuBar: true,
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocalHelperUrl(url)) {
      void shell.openExternal(url);
      return { action: "deny" };
    }

    return { action: "allow" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isLocalHelperUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
      void window.loadURL(helperOrigin);
    }
  });

  await window.loadURL(helperOrigin);
  mainWindow = window;
}

async function ensureWindowForSession(session) {
  if (!helperOrigin) {
    return;
  }

  if (!mainWindow) {
    await createMainWindow();
  }

  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  await mainWindow.loadURL(`${helperOrigin}/session?id=${encodeURIComponent(session.id)}`);
  mainWindow.show();
  mainWindow.focus();
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }

      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    helperServer = await startSteamLinkServer({
      onSessionCreated: (session) => {
        void ensureWindowForSession(session);
      },
    });

    helperOrigin = helperServer.origin;
    await createMainWindow();
  });

  app.on("activate", async () => {
    if (!mainWindow) {
      await createMainWindow();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", (event) => {
    if (!helperServer) {
      return;
    }

    const server = helperServer;
    helperServer = null;
    event.preventDefault();
    void server.close().finally(() => {
      app.exit(0);
    });
  });
}
