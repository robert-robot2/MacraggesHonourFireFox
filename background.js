// Macragge's Honour Download Interceptor Scanner
// background.js - Firefox/Edge compatible version

// =============================================
// BROWSER COMPAT LAYER
// =============================================
const isFirefox = typeof InstallTrigger !== 'undefined';

// Firefox doesn't support chrome.storage.session — fall back to storage.local
const sessionStorage = {
    get: (key) => new Promise((resolve) => {
        chrome.storage.local.get(key, resolve);
    }),
    set: (obj) => new Promise((resolve) => {
        chrome.storage.local.set(obj, resolve);
    }),
    remove: (key) => new Promise((resolve) => {
        chrome.storage.local.remove(key, resolve);
    })
};

// =============================================
// EXTENSION INIT
// =============================================
chrome.runtime.onInstalled.addListener(function () {
    chrome.storage.local.set({
        masterEnabled: true,
        settings: {
            interceptRegular: true,
            interceptAuto: true,
            interceptEmail: true,
            showPopup: true,
            blockPopups: true
        }
    });
});
// =============================================
// POPUP BLOCKER
// =============================================
function writePopupLog(attemptedUrl, sourceTab, popupType) {
    chrome.storage.local.get('popupBlockLog', function (data) {
        const log = data.popupBlockLog || [];
        log.push({
            datetime: new Date().toLocaleString(),
            attemptedUrl: attemptedUrl || 'Unknown',
            sourceTab: sourceTab || 'Unknown',
            popupType: popupType
        });
        chrome.storage.local.set({ popupBlockLog: log });
    });
}

chrome.tabs.onCreated.addListener(function (tab) {
    chrome.storage.local.get(['masterEnabled', 'settings'], function (data) {
        const masterEnabled = data.masterEnabled !== false;
        const settings = data.settings || {};
        const blockPopups = settings.blockPopups !== false;

        if (!masterEnabled || !blockPopups) return;

        // Whitelist our own extension pages
        if (tab.url && tab.url.startsWith(chrome.runtime.getURL(''))) return;
        if (tab.pendingUrl && tab.pendingUrl.startsWith(chrome.runtime.getURL(''))) return;

        // Only block script-opened tabs (has an opener)
        if (tab.openerTabId === undefined) return;

        chrome.tabs.get(tab.openerTabId, function (openerTab) {
            const sourceUrl = openerTab?.url || 'Unknown';
            const blockedUrl = tab.url || tab.pendingUrl || 'Unknown';
            chrome.tabs.remove(tab.id, function () {
                writePopupLog(blockedUrl, sourceUrl, 'tab');
            });
        });
    });
});

chrome.windows.onCreated.addListener(function (win) {
    chrome.storage.local.get(['masterEnabled', 'settings'], function (data) {
        const masterEnabled = data.masterEnabled !== false;
        const settings = data.settings || {};
        const blockPopups = settings.blockPopups !== false;

        if (!masterEnabled || !blockPopups) return;

        // Only block popup type windows, not normal browser windows
        if (win.type !== 'popup') return;

        chrome.tabs.query({ windowId: win.id }, function (tabs) {
            const winUrl = tabs[0]?.url || tabs[0]?.pendingUrl || '';

            // Whitelist our own extension pages
            if (winUrl.startsWith(chrome.runtime.getURL(''))) return;

            chrome.windows.remove(win.id, function () {
                writePopupLog(winUrl, 'Unknown', 'window');
            });
        });
    });
});
// =============================================
// DOWNLOAD LOG
// =============================================
function writeLog(downloadItem, result) {
    chrome.storage.local.get('downloadLog', function (data) {
        const log = data.downloadLog || [];
        log.push({
            datetime: new Date().toLocaleString(),
            filename: downloadItem.filename || 'Email Attachment',
            source: downloadItem.url || 'Unknown',
            isBlob: downloadItem.url.startsWith('blob:'),
            result: result
        });
        chrome.storage.local.set({ downloadLog: log });
    });
}

// =============================================
// DOWNLOAD INTERCEPTOR
// =============================================
chrome.downloads.onCreated.addListener(function (downloadItem) {
    chrome.storage.local.get(['masterEnabled', 'settings'], function (data) {
        const masterEnabled = data.masterEnabled !== false;
        const settings = data.settings || {};
        const interceptRegular = settings.interceptRegular !== false;
        const interceptEmail = settings.interceptEmail !== false;

        if (!masterEnabled) return;

        if (downloadItem.url.startsWith('blob:')) {
            if (!interceptEmail) return;

            sessionStorage.get('approvedBlob').then((approved) => {
                if (approved.approvedBlob) {
                    sessionStorage.remove('approvedBlob');
                    writeLog(downloadItem, 'Allowed');
                    return;
                }
                chrome.downloads.cancel(downloadItem.id, function () {
                    writeLog(downloadItem, 'Intercepted');
                    sessionStorage.set({
                        pendingDownload: {
                            id: downloadItem.id,
                            filename: downloadItem.filename || 'Email Attachment',
                            url: downloadItem.url,
                            finalUrl: downloadItem.finalUrl,
                            isBlob: true,
                            vtResult: { status: 'blob', message: '⚪ Email attachment — cannot scan' }
                        }
                    }).then(() => {
                        chrome.windows.create({
                            url: chrome.runtime.getURL('index.html?route=/warning'),
                            type: 'popup',
                            width: 620,
                            height: 420
                        });
                    });
                });
            });

        } else {
            if (!interceptRegular) return;

            chrome.downloads.pause(downloadItem.id, async function () {
                writeLog(downloadItem, 'Intercepted');

                await sessionStorage.set({
                    pendingDownload: {
                        id: downloadItem.id,
                        filename: downloadItem.filename,
                        url: downloadItem.url,
                        finalUrl: downloadItem.finalUrl,
                        isBlob: false,
                        vtResult: null
                    }
                });

                chrome.windows.create({
                    url: chrome.runtime.getURL('index.html?route=/warning'),
                    type: 'popup',
                    width: 700,
                    height: 500
                });

                const vtResult = await scanUrl(downloadItem.url);
                await sessionStorage.set({
                    pendingDownload: {
                        id: downloadItem.id,
                        filename: downloadItem.filename,
                        url: downloadItem.url,
                        finalUrl: downloadItem.finalUrl,
                        isBlob: false,
                        vtResult: vtResult
                    }
                });
            });
        }
    });
});
// Keep-alive for Firefox MV3 background script
chrome.runtime.onMessage.addListener(() => true);

if (isFirefox) {
    setInterval(() => {
        chrome.runtime.getPlatformInfo(() => { });
    }, 25000);
}