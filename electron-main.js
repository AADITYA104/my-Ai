let electron;
try {
  electron = require('electron');
} catch (_) {
  if (require.main === module) {
    console.log("ℹ️ [ELECTRON NOTICE] Electron is optional. To run floating desktop overlay: npm install electron");
  }
  module.exports = { isAvailable: false };
  return;
}

const { app, BrowserWindow, ipcMain, screen } = electron;
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true, // Hides from taskbar
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load the Ultron UI (which we will make transparent in CSS)
  mainWindow.loadURL('http://localhost:3000');

  // Ignore mouse clicks by default so user can work on other things,
  // but we can toggle this when Ultron is active.
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// Start the local Ultron Neural Core in the background
function startUltronServer() {
  serverProcess = spawn('node', ['ultron-server.js'], {
    cwd: __dirname,
    stdio: 'inherit'
  });
}

app.whenReady().then(() => {
  startUltronServer();
  // Wait a few seconds for server to start before loading UI
  setTimeout(createWindow, 3000);
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
  if (serverProcess) serverProcess.kill();
});

// IPC communication to toggle interaction
ipcMain.on('ultron-active', () => {
  mainWindow.setIgnoreMouseEvents(false);
});

ipcMain.on('ultron-sleep', () => {
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
});
