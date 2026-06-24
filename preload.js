const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('momentum', {
  transcribeFile: (filePath) => ipcRenderer.invoke('transcribe-file', filePath),
  onProgress: (callback) => ipcRenderer.on('transcribe-progress', (event, line) => callback(line)),
  revealInFinder: (folderPath) => ipcRenderer.invoke('reveal-in-finder', folderPath),
});
