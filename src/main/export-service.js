'use strict';
const { BrowserWindow, dialog } = require('electron');
const fs = require('fs');

async function exportHtml(win, html, suggestedName) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出为 HTML',
    defaultPath: suggestedName || 'export.html',
    filters: [{ name: 'HTML', extensions: ['html'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  fs.writeFileSync(filePath, html, 'utf8');
  return { canceled: false, path: filePath };
}

async function exportPdf(win, html, suggestedName) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出为 PDF',
    defaultPath: suggestedName || 'export.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { canceled: true };

  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
  });
  try {
    await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const data = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'printableArea' },
    });
    fs.writeFileSync(filePath, data);
    return { canceled: false, path: filePath };
  } finally {
    pdfWin.destroy();
  }
}

module.exports = { exportHtml, exportPdf };
