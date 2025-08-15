const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('enter-full-screen', () => {
    mainWindow.setMenuBarVisibility(false);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.setMenuBarVisibility(true);
  });

  createMenu();

  // mainWindow.webContents.openDevTools();
}

function createMenu() {
    const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Video',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const { canceled, filePaths } = await dialog.showOpenDialog({
              properties: ['openFile'],
              filters: [
                { name: 'Videos', extensions: ['mp4', 'webm', 'mkv'] }
              ]
            });
            
            if (!canceled && filePaths && filePaths.length > 0) {
              const videoPath = filePaths[0];
              mainWindow.webContents.send('video-selected', videoPath);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          click: () => {
            mainWindow.webContents.send('toggle-fullscreen');
          }
        },
        {
          label: 'Reset Camera',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.webContents.send('reset-camera');
          }
        }
      ]
    },
    {
      label: 'Mode',
      submenu: [
        {
          label: 'Mono (Standard 360°)',
          type: 'radio',
          checked: true,
          click: () => mainWindow.webContents.send('set-mode', 'mono')
        },
        {
          label: 'Stereo (Left-Right)',
          type: 'radio',
          checked: false,
          click: () => mainWindow.webContents.send('set-mode', 'stereo-lr')
        },
        {
          label: 'Stereo (Top-Bottom)',
          type: 'radio',
          checked: false,
          click: () => mainWindow.webContents.send('set-mode', 'stereo-tb')
        },
        {
          label: 'Flat (Regular Video)',
          type: 'radio',
          checked: false,
          click: () => mainWindow.webContents.send('set-mode', 'flat')
        }
        
      ]
    },
    {
  label: 'Quality',
  submenu: [
    {
      label: 'High (Native)',
      type: 'radio',
      checked: true,
      click: () => mainWindow.webContents.send('set-quality', 1.0)
    },
    {
      label: 'Medium (0.75x)',
      type: 'radio',
      click: () => mainWindow.webContents.send('set-quality', 0.75)
    },
    {
      label: 'Low (0.5x)',
      type: 'radio',
      click: () => mainWindow.webContents.send('set-quality', 0.5)
    }
  ]
},
{
  label: 'Tone Mapping',
  submenu: [
    {
      label: 'No Tone Mapping',
      type: 'radio',
      checked: false,
      click: () => {
        mainWindow.webContents.send('set-tone-mapping', 'NoToneMapping');
        // Don't automatically change encoding here
      }
    },
    {
      label: 'ACES Filmic',
      type: 'radio',
      checked: false,
      click: () => {
        mainWindow.webContents.send('set-tone-mapping', 'ACESFilmic');
        // Don't automatically change encoding here
      }
    },
    {
      label: 'Linear',
      type: 'radio',
      checked: true,
      click: () => {
        mainWindow.webContents.send('set-tone-mapping', 'Linear');
        // Don't automatically change encoding here
      }
    },
    {
      label: 'Reinhard',
      type: 'radio',
      checked: false,
      click: () => {
        mainWindow.webContents.send('set-tone-mapping', 'Reinhard');
        // Don't automatically change encoding here
      }
    },
    {
      label: 'Cineon',
      type: 'radio',
      checked: false,
      click: () => {
        mainWindow.webContents.send('set-tone-mapping', 'Cineon');
        // Don't automatically change encoding here
      }
    }
  ]
},
{
    label: 'Encoding',
    submenu: [
        {
            id: 'LinearEncoding',
            label: 'Linear Encoding',
            type: 'radio',
            checked: false,
            // Send just 'Linear' - updateEncoding will add 'Encoding'
            click: () => mainWindow.webContents.send('set-encoding', 'Linear')
        },
        {
            id: 'sRGBEncoding',
            label: 'sRGB Encoding',
            type: 'radio',
            checked: true,
            click: () => mainWindow.webContents.send('set-encoding', 'sRGBEncoding')
        },
        {
            id: 'GammaEncoding',
            label: 'Gamma Encoding',
            type: 'radio',
            checked: false,
            click: () => mainWindow.webContents.send('set-encoding', 'GammaEncoding')
        },
        {
            id: 'RGBEEncoding',
            label: 'RGBE Encoding',
            type: 'radio',
            checked: false,
            click: () => mainWindow.webContents.send('set-encoding', 'RGBEEncoding')
        },
        {
            id: 'LogLuvEncoding',
            label: 'LogLuv Encoding',
            type: 'radio',
            checked: false,
            click: () => mainWindow.webContents.send('set-encoding', 'LogLuvEncoding')
        },
        {
            id: 'RGBM16Encoding',
            label: 'RGBM16 Encoding',
            type: 'radio',
            checked: false,
            click: () => mainWindow.webContents.send('set-encoding', 'RGBM16Encoding')
        },
        {
            id: 'RGBM7Encoding',
            label: 'RGBM7 Encoding',
            type: 'radio',
            checked: false,
            click: () => mainWindow.webContents.send('set-encoding', 'RGBM7Encoding')
        },
        {
            id: 'RGBDEncoding',
            label: 'RGBD Encoding',
            type: 'radio',
            checked: false,
            click: () => mainWindow.webContents.send('set-encoding', 'RGBDEncoding')
        }
    ]
}


    
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC event for file selection from renderer process
ipcMain.on('encoding-changed', (event, encoding) => {
    updateEncodingMenuState(encoding);
});
ipcMain.on('select-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'webm', 'mkv'] }
    ]
  });
  
  if (!canceled && filePaths && filePaths.length > 0) {
    mainWindow.webContents.send('video-selected', filePaths[0]);
  }
});

ipcMain.handle('preprocess-video', async (event, inputPath) => {
  const outputPath = path.join(
    path.dirname(inputPath),
    'preprocessed_' + path.basename(inputPath, path.extname(inputPath)) + '.mp4'
  );

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset veryfast',
        '-crf 18',           // Lower CRF = higher quality (18 is visually lossless)
        '-b:v 10M',          // Set a high video bitrate (10 Mbps)
        '-maxrate 15M',      // Max bitrate
        '-bufsize 20M',      // Buffer size for rate control
        '-b:a 320k',         // High audio bitrate
        '-movflags +faststart'
      ])
      .format('mp4')
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
});

// Add this IPC handler after the other ipcMain handlers
ipcMain.on('toggle-fullscreen', () => {
  if (mainWindow) {
    const isFullScreen = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFullScreen);
  }
});

// Add this function after createMenu()
function updateEncodingMenuState(encoding) {
    const menu = Menu.getApplicationMenu();
    const encodingMenu = menu.items.find(item => item.label === 'Encoding');
    if (encodingMenu && encodingMenu.submenu) {
        encodingMenu.submenu.items.forEach(item => {
            // Add 'Encoding' suffix to the encoding parameter for comparison
            item.checked = item.id === encoding + 'Encoding';
            console.log(`Menu item: "${item.label}", ID: "${item.id}", Current: "${encoding}", Checked: ${item.checked}`);
        });
        Menu.setApplicationMenu(menu);
    }
}
app.whenReady().then(createWindow);
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-accelerated-video-encode');
app.commandLine.appendSwitch('ignore-gpu-blacklist');

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});