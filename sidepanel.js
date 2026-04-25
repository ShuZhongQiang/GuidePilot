let panelState = createInitialPanelState();
const previewLoadState = new Set();

const messages = window.StepRecorderMessages;
const constants = window.StepRecorderConstants || {};

const startRecordBtn = document.getElementById('start-record');
const stopRecordBtn = document.getElementById('stop-record');
const stepsContainer = document.getElementById('steps-container');
const clearStepsBtn = document.getElementById('clear-steps');
const exportMarkdownBtn = document.getElementById('export-markdown');
const exportHtmlBtn = document.getElementById('export-html');
const exportJsonBtn = document.getElementById('export-json');
const aiGenerateBtn = document.getElementById('ai-generate');
const homeView = document.getElementById('home-view');
const aiGenerateView = document.getElementById('ai-generate-view');
const aiConfigView = document.getElementById('ai-config-view');
const openAiConfigBtn = document.getElementById('open-ai-config');
const backFromAiGenerateBtn = document.getElementById('back-from-ai-generate');
const backFromAiConfigBtn = document.getElementById('back-from-ai-config');
const aiPromptInput = document.getElementById('ai-prompt');
const aiGenerateConfirmBtn = document.getElementById('ai-generate-confirm');
const aiGenerateCancelBtn = document.getElementById('ai-generate-cancel');
const autoModeToggle = document.getElementById('auto-mode-toggle');
const modeText = document.querySelector('.mode-text');
const modeHint = document.querySelector('.mode-hint');
const recordingDot = document.getElementById('recording-dot');
const statusText = document.getElementById('status-text');
const documentStatus = document.getElementById('document-status');
const aiApiKeyInput = document.getElementById('ai-api-key');
const aiEndpointInput = document.getElementById('ai-endpoint');
const aiModelInput = document.getElementById('ai-model');
const aiLanguageInput = document.getElementById('ai-language');
const aiSaveConfigBtn = document.getElementById('ai-save-config');

const panelViews = {
  home: homeView,
  aiGenerate: aiGenerateView,
  aiConfig: aiConfigView
};

function switchView(viewName) {
  Object.keys(panelViews).forEach(function eachView(key) {
    const view = panelViews[key];
    if (!view) {
      return;
    }
    if (key === viewName) {
      view.classList.add('panel-view--active');
    } else {
      view.classList.remove('panel-view--active');
    }
  });
}

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
  documentStatus.textContent = compactDocumentStatusLabel(status);
  documentStatus.title = message || compactDocumentStatusTitle(status);
}

function updateModeUI() {
  const isAuto = panelState.recordingMode === 'auto';
  if (autoModeToggle) {
    autoModeToggle.checked = isAuto;
  }
  if (modeText) {
    modeText.textContent = isAuto ? '自动' : '手动';
  }
  if (modeHint) {
    modeHint.textContent = isAuto
      ? '点击后自动截图并保存'
      : '高亮后确认是否保存';
  }
}

function updateStatusUI() {
  const isRecording = panelState.isRecording === true;

  if (startRecordBtn) {
    if (isRecording) {
      startRecordBtn.classList.add('hidden');
    } else {
      startRecordBtn.classList.remove('hidden');
    }
    startRecordBtn.disabled = isRecording;
  }

  if (stopRecordBtn) {
    if (isRecording) {
      stopRecordBtn.classList.remove('hidden');
    } else {
      stopRecordBtn.classList.add('hidden');
    }
    stopRecordBtn.disabled = !isRecording;
  }

  if (recordingDot) {
    recordingDot.className = isRecording ? 'status-dot-red' : 'status-dot-green';
  }

  if (statusText) {
    statusText.textContent = isRecording ? '录制中' : '就绪';
  }
}

function renderStepsView() {
  renderSteps(stepsContainer, panelState.steps, {
    onDeleteStep: handleDeleteStep,
    onLoadPreview: handleLoadPreview,
    onOpenPreview: handleOpenPreview
  });
}

function renderAll() {
  updateStatusUI();
  updateModeUI();
  renderStepsView();
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

function getStorageLocal(keys) {
  return new Promise(function resolveStorage(resolve) {
    chrome.storage.local.get(keys, resolve);
  });
}

async function loadAiConfig() {
  const storageKeys = constants.STORAGE_KEYS || {};
  const settingsKey = storageKeys.SETTINGS || 'recorder:settings';
  const defaultAi = constants.DEFAULT_AI_SETTINGS || {};
  const result = await getStorageLocal([settingsKey]);
  const savedSettings = result && result[settingsKey] ? result[settingsKey] : {};
  const aiSettings = {
    ...defaultAi,
    ...((savedSettings && savedSettings.ai) || {})
  };
  if (aiApiKeyInput) aiApiKeyInput.value = aiSettings.apiKey || '';
  if (aiEndpointInput) aiEndpointInput.value = aiSettings.endpoint || defaultAi.endpoint || '';
  if (aiModelInput) aiModelInput.value = aiSettings.model || defaultAi.model || '';
  if (aiLanguageInput) aiLanguageInput.value = aiSettings.language || defaultAi.language || 'zh-CN';
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

  const hasExistingSteps = Array.isArray(panelState.steps) && panelState.steps.length > 0;
  const isStoppedSession = panelState.session && panelState.session.status === 'stopped';

  let shouldClear = false;
  if (hasExistingSteps) {
    if (isStoppedSession) {
      const userChoice = confirm('检测到已暂停的会话中有步骤，是否保留这些步骤并继续录制？\n\n点击"确定"保留步骤并继续\n点击"取消"清空步骤重新开始');
      shouldClear = !userChoice;
    } else {
      shouldClear = confirm('检测到已有步骤，开始前是否清空当前会话步骤？');
    }
  }

  if (shouldClear) {
    setDocumentStatus('idle', '');
  }

  const result = await sendPanelCommand(messages.COMMAND.SESSION_START, {
    tabId: activeTab.id,
    mode: panelState.recordingMode,
    clearExisting: shouldClear,
    resumeExisting: isStoppedSession && !shouldClear
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

async function handleModeChange() {
  const mode = autoModeToggle && autoModeToggle.checked ? 'auto' : 'manual';

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

async function handleSaveAiConfig() {
  const defaultAi = constants.DEFAULT_AI_SETTINGS || {};
  const aiConfig = {
    enabled: Boolean(
      (aiApiKeyInput && aiApiKeyInput.value && aiApiKeyInput.value.trim())
      || (aiEndpointInput && aiEndpointInput.value && aiEndpointInput.value.trim())
      || (aiModelInput && aiModelInput.value && aiModelInput.value.trim())
    ),
    provider: defaultAi.provider || 'openai-compatible',
    apiKey: aiApiKeyInput && aiApiKeyInput.value ? aiApiKeyInput.value.trim() : '',
    endpoint: aiEndpointInput && aiEndpointInput.value ? aiEndpointInput.value.trim() : '',
    model: aiModelInput && aiModelInput.value ? aiModelInput.value.trim() : '',
    language: aiLanguageInput && aiLanguageInput.value ? aiLanguageInput.value : 'zh-CN'
  };

  const hasConfig = aiConfig.apiKey || aiConfig.endpoint || aiConfig.model;
  if (!hasConfig) {
    alert('请至少填写一项配置。');
    return;
  }

  const result = await sendPanelCommand(messages.COMMAND.SETTINGS_UPDATE, {
    ai: aiConfig
  });

  if (!result || result.ok === false) {
    throw new Error(result && result.error ? result.error : 'ai_config_save_failed');
  }

  alert(aiConfig.apiKey ? 'AI 配置已保存，现在可以使用 AI 生成功能。' : 'AI 配置已保存。');

  if (result.snapshot) {
    mergeSnapshot(result.snapshot);
  }
}

async function handleDeleteStep(step) {
  if (!step || !step.id) return;
  if (!confirm('确定删除该步骤吗？')) return;

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

  if (!step || !step.id || !assetId) return;
  if (previewLoadState.has(step.id)) return;

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

async function handleOpenPreview(step) {
  if (!step || !step.id) return;

  let currentStep = step;

  if (!currentStep.preview || !currentStep.preview.dataUrl) {
    await handleLoadPreview(step);
    currentStep = panelState.steps.find(function findStep(item) {
      return item.id === step.id;
    }) || currentStep;
  }

  if (!currentStep.preview || !currentStep.preview.dataUrl) return;

  try {
    await showImagePreviewOnActivePage(currentStep);
  } catch (error) {
    console.error('[preview page overlay] failed:', error);
    alert('网页预览打开失败，请确认当前页面可注入内容脚本并重试。');
    throw error;
  }
}

function ensureIdlePreviews() {
  panelState.steps.forEach(function eachStep(step) {
    if (!step || !step.preview || !step.preview.assetId) return;
    if (step.preview.status !== 'idle') return;
    handleLoadPreview(step).catch(function ignorePreviewError() {});
  });
}

async function handleClearSteps() {
  if (!Array.isArray(panelState.steps) || panelState.steps.length === 0) return;
  if (!confirm('确定清空当前会话的全部步骤吗？')) return;

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

async function handleExport(format, useAi, options) {
  const sessionId = panelState.activeSessionId || (panelState.session && panelState.session.id);
  if (!sessionId) {
    alert('当前没有可导出的会话。');
    return;
  }

  setDocumentStatus('building', useAi ? 'AI 文档生成中...' : '文档构建中...');

  try {
    const buildResult = await requestDocumentBuild(sessionId, format, useAi, options || {});
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

async function handleAiGenerateSubmit() {
  const prompt = aiPromptInput && aiPromptInput.value ? aiPromptInput.value.trim() : '';
  if (!prompt) {
    alert('请输入 AI 生成提示词。');
    return;
  }

  if (aiGenerateConfirmBtn) {
    aiGenerateConfirmBtn.disabled = true;
    aiGenerateConfirmBtn.textContent = '生成中...';
  }

  try {
    await handleExport('markdown', true, { prompt: prompt });
    switchView('home');
  } finally {
    if (aiGenerateConfirmBtn) {
      aiGenerateConfirmBtn.disabled = false;
      aiGenerateConfirmBtn.textContent = '确认生成';
    }
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
    exportMarkdownBtn.addEventListener('click', function onExportClick() {
      handleExport('markdown', false).catch(function onError(error) {
        console.error('[export markdown] failed:', error);
        alert('导出失败，请重试。');
      });
    });
  }

  if (exportHtmlBtn) {
    exportHtmlBtn.addEventListener('click', function onExportClick() {
      handleExport('html', false).catch(function onError(error) {
        console.error('[export html] failed:', error);
        alert('导出失败，请重试。');
      });
    });
  }

  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', function onExportClick() {
      handleExport('json', false).catch(function onError(error) {
        console.error('[export json] failed:', error);
        alert('导出失败，请重试。');
      });
    });
  }

  if (aiGenerateBtn) {
    aiGenerateBtn.addEventListener('click', function onAiClick() {
      switchView('aiGenerate');
      if (aiPromptInput) aiPromptInput.focus();
    });
  }

  if (openAiConfigBtn) {
    openAiConfigBtn.addEventListener('click', function onSettingsClick() {
      loadAiConfig().catch(function onLoadError(error) {
        console.error('[ai-config] load failed:', error);
      });
      switchView('aiConfig');
    });
  }

  if (backFromAiGenerateBtn) {
    backFromAiGenerateBtn.addEventListener('click', function onBack() {
      switchView('home');
    });
  }

  if (backFromAiConfigBtn) {
    backFromAiConfigBtn.addEventListener('click', function onBack() {
      switchView('home');
    });
  }

  if (aiGenerateCancelBtn) {
    aiGenerateCancelBtn.addEventListener('click', function onCancel() {
      switchView('home');
    });
  }

  if (aiGenerateConfirmBtn) {
    aiGenerateConfirmBtn.addEventListener('click', function onConfirm() {
      handleAiGenerateSubmit().catch(function onAiError(error) {
        console.error('[export ai] failed:', error);
        alert('AI 文档生成失败，请检查配置后重试。');
      });
    });
  }

  if (autoModeToggle) {
    autoModeToggle.addEventListener('change', function onToggleChange() {
      handleModeChange().catch(function onModeError(error) {
        console.error('[mode] failed:', error);
        alert('模式切换失败，请重试。');
      });
    });
  }

  if (aiSaveConfigBtn) {
    aiSaveConfigBtn.addEventListener('click', function onSaveConfig() {
      handleSaveAiConfig().catch(function onSaveError(error) {
        console.error('[ai-config] failed:', error);
        alert('保存配置失败，请重试。');
      });
    });
  }
}

function compactDocumentStatusLabel(status) {
  if (status === 'building') return '构建中';
  if (status === 'ready') return '已就绪';
  if (status === 'failed') return '构建失败';
  return '未构建';
}

function compactDocumentStatusTitle(status) {
  if (status === 'building') return '文档构建中';
  if (status === 'ready') return '文档已就绪';
  if (status === 'failed') return '文档构建失败';
  return '文档尚未构建';
}

async function showImagePreviewOnActivePage(step) {
  const activeTab = await getActiveTab();
  if (!activeTab || typeof activeTab.id !== 'number') {
    throw new Error('active_tab_not_found');
  }

  const target = step.target || {};
  const title = target.text || target.ariaLabel || target.placeholder || target.dataTestId || '点击元素';

  const result = await new Promise(function resolveSend(resolve, reject) {
    chrome.tabs.sendMessage(
      activeTab.id,
      {
        type: messages.PANEL_TO_CONTENT.IMAGE_PREVIEW_SHOW,
        payload: {
          dataUrl: step.preview.dataUrl,
          caption: title,
          width: step.preview.width || null,
          height: step.preview.height || null
        }
      },
      { frameId: 0 },
      function onResponse(response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'send_preview_failed'));
          return;
        }
        resolve(response || { ok: true });
      }
    );
  });

  if (!result || result.ok === false) {
    throw new Error(result && result.error ? result.error : 'preview_show_failed');
  }
}

function init() {
  connectPanelPort();
  onPanelEvent(handlePanelEventMessage);
  setupEventListeners();
  switchView('home');
  renderAll();

  loadAiConfig().catch(function onConfigError(error) {
    console.error('[ai-config] load failed:', error);
  });

  refreshSnapshot().catch(function onSnapshotError(error) {
    console.error('[snapshot] failed:', error);
  });
}

init();
