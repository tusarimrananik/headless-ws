import express from 'express';
import { spawn } from 'child_process';
import getPort from 'get-port';
import path from 'path';
import os from 'os';
import fs from 'fs';

const app = express();
app.use(express.json());

let currentChromeProcess = null;
let currentDevToolsUrl = null;

app.post('/start', async (req, res) => {
    if (currentChromeProcess) {
        return res.status(409).json({ error: 'A Chrome instance is already running. Please stop it before starting a new one.' });
    }

    const port = await getPort();
    const userDataDir = path.join(os.tmpdir(), `profile-${port}`);
    fs.mkdirSync(userDataDir, { recursive: true });

    const chrome = spawn('/snap/bin/chromium', [
        `--remote-debugging-port=${port}`,
        '--remote-debugging-address=0.0.0.0',
        `--user-data-dir=${userDataDir}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        'about:blank'
    ]);

    chrome.stderr.on('data', data => {
        console.error(`[chrome stderr] ${data}`);
    });

    currentChromeProcess = chrome;

    chrome.on('exit', code => {
        console.log(`Chrome exited (${code})`);
        currentChromeProcess = null;
        currentDevToolsUrl = null;
    });

    // Wait a few seconds to ensure Chrome is ready
    setTimeout(async () => {
        try {
            const resDevTools = await fetch(`http://127.0.0.1:${port}/json/version`);
            const info = await resDevTools.json();
            currentDevToolsUrl = info.webSocketDebuggerUrl;
            res.json({
                port,
                webSocketDebuggerUrl: `ws://${req.hostname}:${port}/devtools/browser/${info.webSocketDebuggerUrl.split('/').pop()}`
            });
        } catch (err) {
            console.error(`Failed to connect to DevTools:`, err);
            res.status(500).json({ error: 'Chrome failed to start or exited early.' });
        }
    }, 3000);
});



app.post('/stop', async (req, res) => {
    if (!currentChromeProcess) {
        return res.status(404).json({ error: 'No Chrome process is currently running.' });
    }

    currentChromeProcess.kill('SIGTERM');
    currentChromeProcess = null;
    currentDevToolsUrl = null;

    res.sendStatus(204);
});

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`Spawner listening on :${PORT}`);
});
