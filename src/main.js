const { app, BrowserWindow, shell, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");

// ─── AUTO UPDATER ─────────────────────────────────────────────────────────────
autoUpdater.checkForUpdatesAndNotify();

// ─── WINDOW ───────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "AgriTech International",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0f1117",
  });

  // Always load the live Netlify app
  // This means updates to the web app are instantly reflected in the desktop app
  win.loadURL("https://agritech-international.netlify.app");

  // Open external links in system browser, not in the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Custom menu
  const menu = Menu.buildFromTemplate([
    {
      label: "AgriTech",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => win.reload() },
        { label: "Toggle Fullscreen", accelerator: "F11", click: () => win.setFullScreen(!win.isFullScreen()) },
        { type: "separator" },
        { label: "Quit", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Zoom In",  accelerator: "CmdOrCtrl+=", click: () => win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5) },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5) },
        { label: "Reset Zoom", accelerator: "CmdOrCtrl+0", click: () => win.webContents.setZoomLevel(0) },
        { type: "separator" },
        { label: "Dev Tools", accelerator: "CmdOrCtrl+Shift+I", click: () => win.webContents.openDevTools() },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
