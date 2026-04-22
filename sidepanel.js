let panelState = createInitialPanelState();
const previewLoadState = new Set();

const messages = window.StepRecorderMessages;

const startRecordBtn = document.getElementById('start-record');
const stopRecordBtn = document.getElementById('stop-record');
const recordingStatus = document.getElementById('recording-status');
const recordingBadge = document.getElementById('recording-badge');
const stepsContainer = document.getElementById('steps-container');
const stepsCount = document.getElementById('steps-count');
const clearStepsBtn = document.getElementById('clear-steps');
const exportMarkdownBtn = document.getElementById('export-markdown');
const exportHtmlBtn = document.getElementById('export-html');
const exportJsonBtn = document.getElementById('export-json');
const aiGenerateBtn = document.getElementById('ai-generate');
const modeRadios = document.querySelectorAll('input[name="recording-mode"]');
const sessionOverview = document.getElementById('session-overview');
const documentStatus = document.getElementById('document-status');

function setDocumentStatus(status, message) {
  panelState = {
    ...panelState,
    documentStatus: status,
    documentMessage: message || ''
  };

  renderDocumentStatus();
}

function renderDocumentStatus() {
  if (!documentStatus) {
    return;
  }

  const status = panelState.documentStatus || 'idle';
  const message = panelState.documentMessage || '';

  documentStatus.className = 'doc-status doc-status--' + status;
  documentStatus.textContent = message || (status === 'building' ? '文档构建中...' : '文档尚未构建');
}

function renderSessionOverview() {
  if (!sessionOverview) {
    return;
  }

  const session = panelState.session;
  if (!session) {
    sessionOverview.innerHTML = '<div class="overview-empty">当前没有活动会话</div>';
    return;
  }

  sessionOverview.innerHTML = [
    '<div><strong>Session:</strong> ' + escapeHtml(session.id || '') + '</div>',
    '<div><strong>状态:</strong> ' + escapeHtml(session.status || '') + '</div>',
    '<div><strong>模式:</strong> ' + escapeHtml(session.mode || '') + '</div>',
    '<div><strong>步骤数:</strong> ' + String(session.stepCount || panelState.steps.length || 0) + '</div>'
  ].join('');
}

function updateModeUI() {
  modeRadios.forEach(function eachRadio(radio) {
    radio.checked = radio.value === panelState.recordingMode;
  });
}

function updateStatusUI() {
  const isRecording = panelState.isRecording === true;

  if (startRecordBtn) {
    startRecordBtn.disabled = isRecording;
  }

  if (stopRecordBtn) {
    stopRecordBtn.disabled = !isRecording;
  }

  if (recordingStatus) {
    recordingStatus.textContent = isRecording ? '录制中...' : '就绪';
    recordingStatus.style.color = isRecording ? '#ef4444' : '#6b7280';
  }

  if (recordingBadge) {
    if (isRecording) {
      recordingBadge.classList.remove('hidden');
    } else {
      recordingBadge.classList.add('hidden');
    }
  }

  if (stepsCount) {
    stepsCount.textContent = panelState.steps.length > 0 ? '(' + panelState.steps.length + ')' : '';
  }
}

function renderStepsView() {
  renderSteps(stepsContainer, panelState.steps, {
    onDeleteStep: handleDeleteStep,
    onLoadPreview: handleLoadPreview
  });
}

function renderAll() {
  updateStatusUI();
  updateModeUI();
  renderSessionOverview();
  renderStepsView();
  renderDocumentStatus();
  ensureIdlePreviews();
}

function mergeSnapshot(snapshot) {
  panelState = applySnapshot(panelState, snapshot);
  renderAll();
}

function handlePanelEventMessage(eventMessage) {
  panelState = applyPanelEvent(panelState, eventMessage);
  renderAll();

  if (eventMessage && eventMessage.kind === 'event' && eventMessage.type === messages.EVENT.ASSET_READY) {
    const payload = eventMessage.payload || {};
    const step = panelState.steps.find(function findStep(item) {
      return item.id === payload.stepId;
    });
    if (step) {
      handleLoadPreview(step).catch(function onPreviewError(error) {
        console.error('[asset preview] failed:', error);
      });
    }
  }
}

function getActiveTab() {
  return new Promise(function resolveActiveTab(resolve) {
    chrome.tabs.query({ active: true, currentWindow: true }, function onTabs(tabs) {
      if (chrome.runtime.lastError || !Array.isArray(tabs) || tabs.length === 0) {
        resolve(null);
        return;
      }

      resolve(tabs[0] || null);
    });
  });
}

async function refreshSnapshot() {
  const result = await sendPanelCommand(messages.COMMAND.SESSION_GET_SNAPSHOT, {});
  if (result && result.ok && result.snapshot) {
    mergeSnapshot(result.snapshot);
  }
}

async function handleStartRecording() {
  const activeTab = await getActiveTab();
  if (!activeTab || typeof activeTab.id !== 'number') {
    alert('未找到可录制页面，请先打开一个网页。');
    return;
  }

  const shouldClear = panelState.steps.length > 0
    ? confirm('检测到已有步骤，开始前是否清空当前会话步骤？')
    : false;

  setDocumentStatus('idle', '');

  const result = await sendPanelCommand(messages.COMMAND.SESSION_START, {
    tabId: activeTab.id,
    mode: panelState.recordingMode,
    clearExisting: shouldClear
  });

  if (!result || result.ok === false) {
    throw new Error(result && result.error ? result.error : 'start_failed');
  }

  if (result.snapshot) {
    mergeSnapshot(result.snapshot);
  } else {
    await refreshSnapshot();
  }
}

async function handleStopRecording() {
  const result = await sendPanelCommand(messages.COMMAND.SESSION_STOP, {});
  if (!result || result.ok === false) {
    throw new Error(result && result.error ? result.error : 'stop_failed');
  }

  if (result.snapshot) {
    mergeSnapshot(result.snapshot);
  } else {
    await refreshSnapshot();
  }
}

async function handleModeChange(event) {
  const mode = event && event.target ? event.target.value : 'auto';

  const result = await sendPanelCommand(messages.COMMAND.SETTINGS_UPDATE, {
    mode: mode
  });

  if (!result || result.ok === false) {
    throw new Error(result && result.error ? result.error : 'mode_update_failed');
  }

  if (result.snapshot) {
    mergeSnapshot(result.snapshot);
  }
}

async function handleDeleteStep(step) {
  if (!step || !step.id) {
    return;
  }

  if (!confirm('确定删除该步骤吗？')) {
    return;
  }

  const result = await sendPanelCommand(messages.COMMAND.STEP_DELETE, {
    stepId: step.id
  });

  if (!result || result.ok === false) {
    throw new Error(result && result.error ? result.error : 'delete_failed');
  }

  await refreshSnapshot();
}

async function handleLoadPreview(step) {
  const assetId = step && step.preview && step.preview.assetId
    ? step.preview.assetId
    : step && step.capture && step.capture.primaryAssetId
      ? step.capture.primaryAssetId
      : null;

  if (!step || !step.id || !assetId) {
    return;
  }

  if (previewLoadState.has(step.id)) {
    return;
  }

  previewLoadState.add(step.id);

  panelState = {
    ...panelState,
    steps: updateStepPreview(panelState.steps, {
      stepId: step.id,
      status: 'loading'
    })
  };
  renderAll();

  try {
    const result = await sendPanelCommand(messages.COMMAND.ASSET_GET_PREVIEW, {
      assetId: assetId
    });

    if (!result || result.ok === false || !result.asset) {
      throw new Error(result && result.error ? result.error : 'asset_preview_missing');
    }

    panelState = {
      ...panelState,
      steps: updateStepPreview(panelState.steps, {
        stepId: step.id,
        asset: result.asset
      })
    };
  } catch (error) {
    panelState = {
      ...panelState,
      steps: updateStepPreview(panelState.steps, {
        stepId: step.id,
        status: 'failed',
        error: error && error.message ? error.message : 'asset_preview_failed'
      })
    };
    throw error;
  } finally {
    previewLoadState.delete(step.id);
    renderAll();
  }
}

function ensureIdlePreviews() {
  panelState.steps.forEach(function eachStep(step) {
    if (!step || !step.preview || !step.preview.assetId) {
      return;
    }

    if (step.preview.status !== 'idle') {
      return;
    }

    handleLoadPreview(step).catch(function ignorePreviewError() {});
  });
}

async function handleClearSteps() {
  if (!Array.isArray(panelState.steps) || panelState.steps.length === 0) {
    return;
  }

  if (!confirm('确定清空当前会话的全部步骤吗？')) {
    return;
  }

  const steps = panelState.steps.slice();
  for (const step of steps) {
    const result = await sendPanelCommand(messages.COMMAND.STEP_DELETE, {
      stepId: step.id
    });

    if (!result || result.ok === false) {
      throw new Error(result && result.error ? result.error : 'clear_failed');
    }
  }

  await refreshSnapshot();
}

async function handleExport(format, useAi) {
  const sessionId = panelState.activeSessionId || (panelState.session && panelState.session.id);
  if (!sessionId) {
    alert('当前没有可导出的会话。');
    return;
  }

  setDocumentStatus('building', '文档构建中...');

  try {
    const buildResult = await requestDocumentBuild(sessionId, format, useAi);
    await downloadExportBundle(buildResult);

    if (useAi) {
      if (buildResult.ai && buildResult.ai.status === 'completed') {
        setDocumentStatus('ready', 'AI 改写完成，文档已触发下载。');
      } else if (buildResult.ai && buildResult.ai.status === 'fallback') {
        setDocumentStatus('ready', 'AI 未配置或调用失败，已使用规则改写并触发下载。');
      } else {
        setDocumentStatus('ready', '文档已触发下载。');
      }
    } else {
      setDocumentStatus('ready', '文档构建完成，已触发下载。');
    }
  } catch (error) {
    setDocumentStatus('failed', '文档构建失败: ' + (error && error.message ? error.message : 'unknown_error'));
    throw error;
  }
}

function setupEventListeners() {
  if (startRecordBtn) {
    startRecordBtn.addEventListener('click', function onStartClick() {
      handleStartRecording().catch(function onStartError(error) {
        console.error('[start] failed:', error);
        alert('启动录制失败，请重试。');
      });
    });
  }

  if (stopRecordBtn) {
    stopRecordBtn.addEventListener('click', function onStopClick() {
      handleStopRecording().catch(function onStopError(error) {
        console.error('[stop] failed:', error);
        alert('停止录制失败，请重试。');
      });
    });
  }

  if (clearStepsBtn) {
    clearStepsBtn.addEventListener('click', function onClearClick() {
      handleClearSteps().catch(function onClearError(error) {
        console.error('[clear] failed:', error);
        alert('清空失败，请重试。');
      });
    });
  }

  if (exportMarkdownBtn) {
    exportMarkdownBtn.addEventListener('click', function onExportMarkdownClick() {
      handleExport('markdown', false).catch(function onExportMarkdownError(error) {
        console.error('[export markdown] failed:', error);
        alert('导出失败，请重试。');
      });
    });
  }

  if (exportHtmlBtn) {
    exportHtmlBtn.addEventListener('click', function onExportHtmlClick() {
      handleExport('html', false).catch(function onExportHtmlError(error) {
        console.error('[export html] failed:', error);
        alert('导出失败，请重试。');
      });
    });
  }

  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', function onExportJsonClick() {
      handleExport('json', false).catch(function onExportJsonError(error) {
        console.error('[export json] failed:', error);
        alert('导出失败，请重试。');
      });
    });
  }

  if (aiGenerateBtn) {
    aiGenerateBtn.addEventListener('click', function onAiGenerateClick() {
      handleExport('markdown', true).catch(function onAiError(error) {
        console.error('[export ai] failed:', error);
        alert('AI 文档生成失败，请检查配置后重试。');
      });
    });
  }

  modeRadios.forEach(function eachRadio(radio) {
    radio.addEventListener('change', function onModeChange(event) {
      handleModeChange(event).catch(function onModeError(error) {
        console.error('[mode] failed:', error);
        alert('模式切换失败，请重试。');
      });
    });
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function init() {
  connectPanelPort();
  onPanelEvent(handlePanelEventMessage);
  setupEventListeners();
  renderAll();

  refreshSnapshot().catch(function onSnapshotError(error) {
    console.error('[snapshot] failed:', error);
  });
}

init();
