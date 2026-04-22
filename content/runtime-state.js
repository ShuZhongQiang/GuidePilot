(function initContentRuntimeState(global) {
  const runtimeState = {
    isRecording: false,
    mode: 'auto',
    sessionId: null,
    overlay: null,
    isReplayingClick: false,
    pendingManualAction: null,
    currentCandidate: null,
    runtimeMessageListener: null,
    keydownListener: null
  };

  function getRuntimeState() {
    return runtimeState;
  }

  function setRuntimeState(partialState) {
    if (!partialState || typeof partialState !== 'object') {
      return runtimeState;
    }

    Object.assign(runtimeState, partialState);
    return runtimeState;
  }

  function sendRecorderRuntimeMessage(message) {
    return new Promise(function resolveMessage(resolve) {
      if (!chrome || !chrome.runtime || !chrome.runtime.id) {
        resolve({ ok: false, error: 'runtime_unavailable', response: null });
        return;
      }

      try {
        chrome.runtime.sendMessage(message, function onMessage(response) {
          if (chrome.runtime.lastError) {
            resolve({
              ok: false,
              error: chrome.runtime.lastError.message || 'runtime_error',
              response: null
            });
            return;
          }

          resolve({
            ok: true,
            error: null,
            response: response || null
          });
        });
      } catch (error) {
        resolve({
          ok: false,
          error: error && error.message ? error.message : 'runtime_error',
          response: null
        });
      }
    });
  }

  global.getRuntimeState = getRuntimeState;
  global.setRuntimeState = setRuntimeState;
  global.sendRecorderRuntimeMessage = sendRecorderRuntimeMessage;
})(typeof self !== 'undefined' ? self : window);
