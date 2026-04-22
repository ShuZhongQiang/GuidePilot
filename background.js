importScripts(
  'shared/constants.js',
  'shared/message-types.js',
  'shared/schemas.js',
  'background/asset-store.js',
  'background/session-store.js',
  'background/ai-service.js',
  'background/document-builder.js',
  'background/recorder-service.js',
  'background/message-router.js',
  'background/migration.js'
);

let migrationPromise = null;

function ensureMigrationsReady() {
  if (!migrationPromise) {
    migrationPromise = runMigrationsIfNeeded().catch(function onMigrationError(error) {
      console.error('[migration] failed:', error);
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}

function sendMessageToTab(tabId, message) {
  return new Promise(function resolveSend(resolve) {
    if (typeof tabId !== 'number') {
      resolve(false);
      return;
    }

    chrome.tabs.sendMessage(tabId, message, function onSend() {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

function executeScript(tabId, files) {
  return new Promise(function resolveExecute(resolve) {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId, allFrames: true },
        files: files
      },
      function onExecuted() {
        if (chrome.runtime.lastError) {
          console.warn('[executeScript] failed:', chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        resolve(true);
      }
    );
  });
}

async function ensureRecorderScript(tabId) {
  const fileList = [
    'shared/constants.js',
    'shared/message-types.js',
    'shared/schemas.js',
    'content/runtime-state.js',
    'content/target-fingerprint.js',
    'content/page-context.js',
    'content/screenshot-capture.js',
    'content/manual-confirm.js',
    'content/action-capture.js',
    'content.js'
  ];

  return executeScript(tabId, fileList);
}

function isWebTab(tab) {
  if (!tab || typeof tab.id !== 'number' || !tab.url) {
    return false;
  }

  return (
    tab.url.startsWith('http://') ||
    tab.url.startsWith('https://') ||
    tab.url.startsWith('file://')
  );
}

function queryTabs(queryInfo) {
  return new Promise(function resolveQuery(resolve) {
    chrome.tabs.query(queryInfo, function onTabs(tabs) {
      resolve(Array.isArray(tabs) ? tabs : []);
    });
  });
}

function getTabById(tabId) {
  return new Promise(function resolveTab(resolve) {
    if (typeof tabId !== 'number') {
      resolve(null);
      return;
    }

    chrome.tabs.get(tabId, function onTab(tab) {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tab || null);
    });
  });
}

async function getBestActiveTab() {
  const preferred = await queryTabs({ active: true, lastFocusedWindow: true });
  const preferredWeb = preferred.filter(isWebTab);
  if (preferredWeb.length > 0) {
    return preferredWeb[0];
  }

  const current = await queryTabs({ active: true, currentWindow: true });
  const currentWeb = current.filter(isWebTab);
  if (currentWeb.length > 0) {
    return currentWeb[0];
  }

  const allActive = await queryTabs({ active: true });
  const allActiveWeb = allActive.filter(isWebTab);
  if (allActiveWeb.length > 0) {
    return allActiveWeb[0];
  }

  const allTabs = await queryTabs({});
  const anyWeb = allTabs.filter(isWebTab);
  return anyWeb[0] || null;
}

async function getCurrentActiveTabId() {
  const tab = await getBestActiveTab();
  return tab && typeof tab.id === 'number' ? tab.id : null;
}

function createBackgroundContext() {
  return {
    ensureMigrationsReady: ensureMigrationsReady,
    sendMessageToTab: sendMessageToTab,
    executeScript: executeScript,
    ensureRecorderScript: ensureRecorderScript,
    getBestActiveTab: getBestActiveTab,
    getCurrentActiveTabId: getCurrentActiveTabId,
    getTabById: getTabById
  };
}

function respondWithPromise(sendResponse, promise) {
  promise
    .then(function onResult(result) {
      sendResponse(result);
    })
    .catch(function onError(error) {
      console.error('[background] action failed:', error);
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : 'unknown_error'
      });
    });
}

chrome.runtime.onMessage.addListener(function onRuntimeMessage(message, sender, sendResponse) {
  const context = createBackgroundContext();
  const messages = self.StepRecorderMessages;
  const commandTypes = new Set(Object.values(messages.COMMAND));
  const contentTypes = new Set(Object.values(messages.CONTENT_TO_BACKGROUND));

  if (message && typeof message.type === 'string' && commandTypes.has(message.type)) {
    respondWithPromise(sendResponse, handlePanelCommand(message.type, message.payload || {}, context));
    return true;
  }

  if (message && typeof message.type === 'string' && contentTypes.has(message.type)) {
    respondWithPromise(sendResponse, handleRuntimeMessage(message, sender, context));
    return true;
  }

  return false;
});

chrome.runtime.onConnect.addListener(function onConnect(port) {
  handlePanelPort(port, createBackgroundContext());
});

chrome.tabs.onUpdated.addListener(function onTabUpdated(tabId, changeInfo) {
  if (changeInfo.status !== 'complete') {
    return;
  }

  ensureMigrationsReady()
    .then(function onReady() {
      return getRecordingState();
    })
    .then(async function onState(state) {
      if (!state.isRecording || state.recordingTabId !== tabId) {
        return;
      }

      const activeSession = await getActiveSession();
      if (!activeSession) {
        return;
      }

      let success = await sendMessageToTab(tabId, {
        type: self.StepRecorderMessages.BACKGROUND_TO_CONTENT.RUNTIME_START,
        payload: {
          sessionId: activeSession.id,
          mode: activeSession.mode
        }
      });

      if (!success) {
        const injected = await ensureRecorderScript(tabId);
        if (injected) {
          success = await sendMessageToTab(tabId, {
            type: self.StepRecorderMessages.BACKGROUND_TO_CONTENT.RUNTIME_START,
            payload: {
              sessionId: activeSession.id,
              mode: activeSession.mode
            }
          });
        }
      }

      if (success) {
        await sendMessageToTab(tabId, {
          type: self.StepRecorderMessages.BACKGROUND_TO_CONTENT.RUNTIME_CONFIGURE,
          payload: {
            sessionId: activeSession.id,
            mode: activeSession.mode
          }
        });
      }
    })
    .catch(function onResumeError(error) {
      console.error('[tabs.onUpdated] failed to resume recorder:', error);
    });
});

chrome.tabs.onRemoved.addListener(function onTabRemoved(tabId) {
  ensureMigrationsReady()
    .then(function onReady() {
      return getRecordingState();
    })
    .then(async function onState(state) {
      if (state.recordingTabId !== tabId) {
        return;
      }

      await stopRecordingSession();
      await emitSnapshotEvent();
      broadcastPanelEvent(self.StepRecorderMessages.EVENT.SESSION_UPDATED, {
        session: null,
        snapshot: await buildRecorderSnapshot()
      });
    })
    .catch(function ignoreRemoveError() {});
});

chrome.runtime.onInstalled.addListener(async function onInstalled() {
  await ensureMigrationsReady();
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(function onStartup() {
  ensureMigrationsReady().catch(function ignoreStartupMigrationError() {});
});

ensureMigrationsReady().catch(function ignoreBootMigrationError() {});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function ignoreSidePanelError() {});
