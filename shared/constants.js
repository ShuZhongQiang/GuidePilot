(function initStepRecorderConstants(global) {
  const STEP_STATUS = Object.freeze({
    PENDING: 'pending',
    READY: 'ready',
    FAILED: 'failed'
  });

  const SESSION_STATUS = Object.freeze({
    RECORDING: 'recording',
    STOPPED: 'stopped'
  });

  const ACTION_TYPE = Object.freeze({
    CLICK: 'click',
    INPUT: 'input',
    SELECT: 'select',
    SCROLL: 'scroll'
  });

  const ASSET_KIND = Object.freeze({
    PRIMARY: 'primary',
    BEFORE: 'before',
    AFTER: 'after',
    THUMBNAIL: 'thumbnail'
  });

  const PREVIEW_STATUS = Object.freeze({
    IDLE: 'idle',
    LOADING: 'loading',
    READY: 'ready',
    FAILED: 'failed',
    UNAVAILABLE: 'unavailable'
  });

  const COMMIT_STATUS = Object.freeze({
    STARTED: 'started',
    ASSET_WRITTEN: 'asset_written',
    STORAGE_COMMITTED: 'storage_committed'
  });

  const STORAGE_KEYS = Object.freeze({
    META: 'recorder:meta',
    SETTINGS: 'recorder:settings',
    ACTIVE_SESSION_ID: 'recorder:activeSessionId',
    SESSION_INDEX: 'recorder:sessionIndex',
    SESSION: function sessionKey(sessionId) {
      return 'recorder:session:' + sessionId;
    },
    SESSION_STEPS: function sessionStepsKey(sessionId) {
      return 'recorder:sessionSteps:' + sessionId;
    },
    STEP: function stepKey(stepId) {
      return 'recorder:step:' + stepId;
    },
    ASSET_META: function assetMetaKey(assetId) {
      return 'recorder:assetMeta:' + assetId;
    },
    PENDING_COMMIT: function pendingCommitKey(stepId) {
      return 'recorder:pendingCommit:' + stepId;
    }
  });

  const DEFAULT_AI_SETTINGS = Object.freeze({
    enabled: false,
    provider: 'openai-compatible',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4.1-mini',
    apiKey: '',
    language: 'zh-CN'
  });

  global.StepRecorderConstants = Object.freeze({
    SCHEMA_VERSION: 2,
    STEP_STATUS: STEP_STATUS,
    SESSION_STATUS: SESSION_STATUS,
    ACTION_TYPE: ACTION_TYPE,
    ASSET_KIND: ASSET_KIND,
    PREVIEW_STATUS: PREVIEW_STATUS,
    COMMIT_STATUS: COMMIT_STATUS,
    STORAGE_KEYS: STORAGE_KEYS,
    DEFAULT_AI_SETTINGS: DEFAULT_AI_SETTINGS
  });
})(typeof self !== 'undefined' ? self : window);
