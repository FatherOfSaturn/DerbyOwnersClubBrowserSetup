const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ─── Paths ────────────────────────────────────────────────────────────────────

const isDev = !app.isPackaged;

// In dev, resources are relative to project root.
// In prod, electron-builder puts extraResources in process.resourcesPath.
const resourcesPath = isDev
    ? path.join(__dirname, 'resources')
    : process.resourcesPath;

const backendPath = isDev
    ? path.join(__dirname, 'backend')
    : path.join(__dirname, 'backend');

const mediamtxExe = path.join(resourcesPath, 'mediamtx.exe');
const mediamtxConfig = path.join(resourcesPath, 'mediamtx.yml');

// ─── Child processes ──────────────────────────────────────────────────────────

let nodeProcess = null;
let mediamtxProcess = null;

function startBackend() {
    console.log('[electron] starting Node backend...');

    nodeProcess = spawn('node', ['server.js'], {
        cwd: backendPath,
        env: {
            ...process.env,
            NODE_ENV: 'production',
        },
    });

    nodeProcess.stdout.on('data', (d) => process.stdout.write(`[node] ${d}`));
    nodeProcess.stderr.on('data', (d) => process.stderr.write(`[node] ${d}`));

    nodeProcess.on('exit', (code) => {
        console.log(`[electron] Node exited with code ${code}`);
    });
}

function startMediaMTX() {
    if (!fs.existsSync(mediamtxExe)) {
        console.warn('[electron] mediamtx.exe not found, skipping');
        return;
    }

    console.log('[electron] starting MediaMTX...');

    mediamtxProcess = spawn(mediamtxExe, [mediamtxConfig], {
        cwd: resourcesPath,
    });

    mediamtxProcess.stdout.on('data', (d) => process.stdout.write(`[mediamtx] ${d}`));
    mediamtxProcess.stderr.on('data', (d) => process.stderr.write(`[mediamtx] ${d}`));

    mediamtxProcess.on('exit', (code) => {
        console.log(`[electron] MediaMTX exited with code ${code}`);
    });
}

function stopAll() {
    if (nodeProcess) { nodeProcess.kill(); nodeProcess = null; }
    if (mediamtxProcess) { mediamtxProcess.kill(); mediamtxProcess = null; }
}

// ─── Wait for backend to be ready ────────────────────────────────────────────

function waitForBackend(url, retries = 20, delay = 500) {
    return new Promise((resolve, reject) => {
        const attempt = (remaining) => {
            http.get(url, (res) => {
                if (res.statusCode < 500) resolve();
                else if (remaining > 0) setTimeout(() => attempt(remaining - 1), delay);
                else reject(new Error('Backend did not start'));
            }).on('error', () => {
                if (remaining > 0) setTimeout(() => attempt(remaining - 1), delay);
                else reject(new Error('Backend did not start'));
            });
        };
        attempt(retries);
    });
}

// ─── ViGEm check ─────────────────────────────────────────────────────────────

function checkViGEm() {
    // ViGEm installs a service called "ViGEmBus" — check the registry for it
    const { execSync } = require('child_process');
    try {
        execSync('sc query ViGEmBus', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

async function createWindow() {
    // Check ViGEm before anything else
    if (!checkViGEm()) {
        const { response } = await dialog.showMessageBox({
            type: 'warning',
            title: 'Missing Driver',
            message: 'ViGEm Bus Driver is not installed.',
            detail: 'Derby Owners Club requires the ViGEm Bus Driver to emulate game controllers. Click Download to get it.',
            buttons: ['Download ViGEm', 'Continue Anyway', 'Quit'],
            defaultId: 0,
        });

        if (response === 0) {
            shell.openExternal('https://github.com/nefarius/ViGEmBus/releases/latest');
            app.quit();
            return;
        } else if (response === 2) {
            app.quit();
            return;
        }
    }

    // Start backend services
    startBackend();
    startMediaMTX();

    // Wait for Node to be ready
    try {
        await waitForBackend('http://localhost:3000/health');
        console.log('[electron] backend ready');
    } catch {
        dialog.showErrorBox('Startup Error', 'The backend server failed to start. Please restart the app.');
        app.quit();
        return;
    }

    // Create the main window
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        title: 'Derby Owners Club',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    win.loadURL('http://localhost:3000');

    // Hide menu bar
    win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    stopAll();
    app.quit();
});

app.on('before-quit', () => {
    stopAll();
});