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

  const TITLE_VALIDATION = Object.freeze({
    MAX_LENGTH: 25,
    BAD_PREFIXES: [
      /^这是/i,
      /^这是一份/i,
      /^这是一个/i,
      /^这是一本/i,
      /^请/i,
      /^请帮我/i,
      /^我想/i,
      /^生成/i,
      /^帮我/i
    ]
  });

  const TITLE_CLEAN_PATTERNS = Object.freeze([
    /^这是(一份|一个|一本)?/i,
    /^请(帮我)?/i,
    /^帮我/i,
    /^我想/i,
    /[。.!！?？]+$/g
  ]);

  const EXPORT_TOKEN_CLEAN_PATTERNS = Object.freeze([
    [/后台管理系统|管理系统|管理后台/g, '后台'],
    [/操作手册|操作指南|手册|指南|文档|说明|教程/g, '']
  ]);

  global.StepRecorderConstants = Object.freeze({
    SCHEMA_VERSION: 2,
    STEP_STATUS: STEP_STATUS,
    SESSION_STATUS: SESSION_STATUS,
    ACTION_TYPE: ACTION_TYPE,
    ASSET_KIND: ASSET_KIND,
    PREVIEW_STATUS: PREVIEW_STATUS,
    COMMIT_STATUS: COMMIT_STATUS,
    STORAGE_KEYS: STORAGE_KEYS,
    DEFAULT_AI_SETTINGS: DEFAULT_AI_SETTINGS,
    TITLE_VALIDATION: TITLE_VALIDATION,
    TITLE_CLEAN_PATTERNS: TITLE_CLEAN_PATTERNS,
    EXPORT_TOKEN_CLEAN_PATTERNS: EXPORT_TOKEN_CLEAN_PATTERNS
  });
})(typeof self !== 'undefined' ? self : window);
