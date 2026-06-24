const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// Baked in at build time from config.js (gitignored, see config.example.js) so
// end users need zero setup. See README for the security tradeoff.
let GROQ_API_KEY;
try {
  GROQ_API_KEY = require('./config').GROQ_API_KEY;
} catch (e) {
  GROQ_API_KEY = '';
}
if (!GROQ_API_KEY) {
  console.error('Missing config.js with GROQ_API_KEY — copy config.example.js to config.js and fill it in before building.');
}

const isPackaged = app.isPackaged;
const resourcesDir = isPackaged ? process.resourcesPath : __dirname;

function resourcePath(...parts) {
  return path.join(resourcesDir, ...parts);
}

function pythonBinaryPath() {
  // Packaged: PyInstaller onedir output bundled under resources/python-dist/transcribe
  // Dev: fall back to system python3 running the source script directly.
  if (isPackaged) {
    return resourcePath('python-dist', 'transcribe', 'transcribe');
  }
  return null;
}

function ffmpegPath(name) {
  if (isPackaged) {
    return resourcePath('ffmpeg', name);
  }
  return name; // rely on PATH in dev
}

function momentumOutputRoot() {
  const dir = path.join(os.homedir(), 'Desktop', 'momentum');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 520,
    title: 'Momentum Transcribe',
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('transcribe-file', async (event, filePath) => {
  const outdir = momentumOutputRoot();
  const bin = pythonBinaryPath();

  const args = isPackaged
    ? [filePath, '--api-key', GROQ_API_KEY, '--speakers', '--outdir', outdir]
    : [path.join(__dirname, 'python', 'transcribe.py'), filePath, '--api-key', GROQ_API_KEY, '--speakers', '--outdir', outdir];

  const command = isPackaged ? bin : 'python3';
  const env = Object.assign({}, process.env, {
    FFMPEG_PATH: ffmpegPath('ffmpeg'),
    FFPROBE_PATH: ffmpegPath('ffprobe'),
  });

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env });
    let lastError = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      text.split(/\r?\n/).forEach((line) => {
        line = line.trim();
        if (!line) return;
        mainWindow.webContents.send('transcribe-progress', line);
      });
    });

    child.stderr.on('data', (data) => {
      lastError += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true });
      } else {
        reject(new Error(lastError || `Transcription process exited with code ${code}`));
      }
    });

    child.on('error', (err) => reject(err));
  });
});

ipcMain.handle('reveal-in-finder', async (event, folderPath) => {
  shell.showItemInFolder(folderPath);
});
