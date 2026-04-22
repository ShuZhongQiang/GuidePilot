(function initStepRecorderSchemas(global) {
  function nowIso() {
    return new Date().toISOString();
  }

  function createId(prefix) {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return prefix + '_' + crypto.randomUUID();
    }
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function toFiniteNumber(value, fallback) {
    return Number.isFinite(value) ? Number(value) : (Number.isFinite(fallback) ? Number(fallback) : 0);
  }

  function stringOrEmpty(value) {
    return value == null ? '' : String(value);
  }

  function normalizeRect(input) {
    if (!input || typeof input !== 'object') {
      return null;
    }

    return {
      left: toFiniteNumber(input.left, 0),
      top: toFiniteNumber(input.top, 0),
      width: toFiniteNumber(input.width, 0),
      height: toFiniteNumber(input.height, 0),
      viewportWidth: toFiniteNumber(input.viewportWidth, 0),
      viewportHeight: toFiniteNumber(input.viewportHeight, 0),
      scrollX: toFiniteNumber(input.scrollX, 0),
      scrollY: toFiniteNumber(input.scrollY, 0)
    };
  }

  function normalizePageRecord(input) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      url: stringOrEmpty(source.url),
      title: stringOrEmpty(source.title)
    };
  }

  function normalizeTargetFingerprint(input) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      tagName: stringOrEmpty(source.tagName).toLowerCase(),
      selector: stringOrEmpty(source.selector),
      fallbackSelectors: ensureArray(source.fallbackSelectors)
        .map(function mapSelector(item) {
          return stringOrEmpty(item);
        })
        .filter(Boolean),
      role: stringOrEmpty(source.role),
      text: stringOrEmpty(source.text),
      ariaLabel: stringOrEmpty(source.ariaLabel),
      placeholder: stringOrEmpty(source.placeholder),
      href: stringOrEmpty(source.href),
      dataTestId: stringOrEmpty(source.dataTestId),
      rect: normalizeRect(source.rect),
      framePath: ensureArray(source.framePath)
        .map(function mapFrame(item) {
          return stringOrEmpty(item);
        })
        .filter(Boolean)
    };
  }

  function normalizeCaptureRecord(input) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      primaryAssetId: source.primaryAssetId ? String(source.primaryAssetId) : null,
      beforeAssetId: source.beforeAssetId ? String(source.beforeAssetId) : null,
      afterAssetId: source.afterAssetId ? String(source.afterAssetId) : null
    };
  }

  function normalizeStepRecord(input) {
    const constants = global.StepRecorderConstants || {};
    const stepStatus = constants.STEP_STATUS || {};
    const actionType = constants.ACTION_TYPE || {};
    const now = nowIso();
    const step = input && typeof input === 'object' ? input : {};

    return {
      id: String(step.id || createId('step')),
      sessionId: stringOrEmpty(step.sessionId),
      seq: typeof step.seq === 'number' ? step.seq : 0,
      status: stringOrEmpty(step.status || stepStatus.READY || 'ready'),
      actionType: stringOrEmpty(step.actionType || actionType.CLICK || 'click'),
      page: normalizePageRecord(step.page),
      target: normalizeTargetFingerprint(step.target),
      capture: normalizeCaptureRecord(step.capture),
      createdAt: stringOrEmpty(step.createdAt || now),
      updatedAt: stringOrEmpty(step.updatedAt || now),
      error: step.error ? String(step.error) : null
    };
  }

  function createSessionRecord(input) {
    const constants = global.StepRecorderConstants || {};
    const sessionStatus = constants.SESSION_STATUS || {};
    const schemaVersion = constants.SCHEMA_VERSION || 2;
    const startedAt = input && input.startedAt ? String(input.startedAt) : nowIso();

    return {
      id: input && input.id ? String(input.id) : createId('session'),
      schemaVersion: schemaVersion,
      status: input && input.status ? String(input.status) : (sessionStatus.RECORDING || 'recording'),
      mode: input && input.mode ? String(input.mode) : 'auto',
      tabId: input && typeof input.tabId === 'number' ? input.tabId : null,
      windowId: input && typeof input.windowId === 'number' ? input.windowId : null,
      startedAt: startedAt,
      endedAt: input && input.endedAt ? String(input.endedAt) : null,
      stepCount: input && typeof input.stepCount === 'number' ? input.stepCount : 0
    };
  }

  function createActionDraft(input) {
    const constants = global.StepRecorderConstants || {};
    const actionType = constants.ACTION_TYPE || {};
    const draft = input && typeof input === 'object' ? input : {};

    return {
      actionId: String(draft.actionId || createId('action')),
      actionType: String(draft.actionType || actionType.CLICK || 'click'),
      page: normalizePageRecord(draft.page),
      target: normalizeTargetFingerprint(draft.target),
      capture: {
        strategy: draft.capture && draft.capture.strategy ? String(draft.capture.strategy) : 'before',
        primaryImageDataUrl: draft.capture && draft.capture.primaryImageDataUrl
          ? String(draft.capture.primaryImageDataUrl)
          : null,
        annotationRect: draft.capture && draft.capture.annotationRect
          ? normalizeRect(draft.capture.annotationRect)
          : null
      },
      meta: {
        manualConfirmed: Boolean(draft.meta && draft.meta.manualConfirmed),
        capturedAt: draft.meta && draft.meta.capturedAt ? String(draft.meta.capturedAt) : nowIso()
      }
    };
  }

  function createAssetMeta(input) {
    const asset = input && typeof input === 'object' ? input : {};
    return {
      id: String(asset.id || createId('asset')),
      sessionId: stringOrEmpty(asset.sessionId),
      stepId: stringOrEmpty(asset.stepId),
      kind: stringOrEmpty(asset.kind || 'primary'),
      mimeType: stringOrEmpty(asset.mimeType || 'image/png'),
      width: Number.isFinite(asset.width) ? Number(asset.width) : null,
      height: Number.isFinite(asset.height) ? Number(asset.height) : null,
      byteSize: Number.isFinite(asset.byteSize) ? Number(asset.byteSize) : 0,
      createdAt: stringOrEmpty(asset.createdAt || nowIso())
    };
  }

  function createPendingCommitRecord(input) {
    const pending = input && typeof input === 'object' ? input : {};
    const constants = global.StepRecorderConstants || {};
    const commitStatus = constants.COMMIT_STATUS || {};

    return {
      id: String(pending.id || createId('commit')),
      stepId: String(pending.stepId || createId('step')),
      sessionId: stringOrEmpty(pending.sessionId),
      status: stringOrEmpty(pending.status || commitStatus.STARTED || 'started'),
      draft: createActionDraft(pending.draft),
      assetMeta: pending.assetMeta ? createAssetMeta(pending.assetMeta) : null,
      startedAt: stringOrEmpty(pending.startedAt || nowIso()),
      updatedAt: stringOrEmpty(pending.updatedAt || nowIso()),
      error: pending.error ? String(pending.error) : null
    };
  }

  function createDocumentStep(input) {
    const step = input && typeof input === 'object' ? input : {};
    return {
      stepId: stringOrEmpty(step.stepId),
      seq: typeof step.seq === 'number' ? step.seq : 0,
      title: stringOrEmpty(step.title),
      instruction: stringOrEmpty(step.instruction),
      pageUrl: stringOrEmpty(step.pageUrl),
      pageTitle: stringOrEmpty(step.pageTitle),
      targetText: stringOrEmpty(step.targetText),
      selector: stringOrEmpty(step.selector),
      primaryAssetId: step.primaryAssetId ? String(step.primaryAssetId) : null
    };
  }

  function createDocumentPayload(input) {
    const payload = input && typeof input === 'object' ? input : {};
    return {
      session: payload.session ? createSessionRecord(payload.session) : null,
      steps: ensureArray(payload.steps).map(createDocumentStep)
    };
  }

  function createAiRewriteRequest(input) {
    const payload = input && typeof input === 'object' ? input : {};
    return {
      session: payload.session ? createSessionRecord(payload.session) : null,
      steps: ensureArray(payload.steps).map(createDocumentStep),
      language: stringOrEmpty(payload.language || 'zh-CN')
    };
  }

  function createAiRewriteResult(input) {
    const payload = input && typeof input === 'object' ? input : {};
    return {
      title: stringOrEmpty(payload.title),
      summary: stringOrEmpty(payload.summary),
      sections: ensureArray(payload.sections).map(function mapSection(item) {
        return {
          heading: stringOrEmpty(item && item.heading),
          stepIds: ensureArray(item && item.stepIds).map(function mapStepId(stepId) {
            return stringOrEmpty(stepId);
          }).filter(Boolean)
        };
      }),
      rewrittenSteps: ensureArray(payload.rewrittenSteps).map(function mapStep(item) {
        return {
          stepId: stringOrEmpty(item && item.stepId),
          title: stringOrEmpty(item && item.title),
          instruction: stringOrEmpty(item && item.instruction)
        };
      })
    };
  }

  global.StepRecorderSchemas = Object.freeze({
    createId: createId,
    normalizeRect: normalizeRect,
    normalizePageRecord: normalizePageRecord,
    normalizeTargetFingerprint: normalizeTargetFingerprint,
    normalizeCaptureRecord: normalizeCaptureRecord,
    createSessionRecord: createSessionRecord,
    normalizeStepRecord: normalizeStepRecord,
    createActionDraft: createActionDraft,
    createAssetMeta: createAssetMeta,
    createPendingCommitRecord: createPendingCommitRecord,
    createDocumentStep: createDocumentStep,
    createDocumentPayload: createDocumentPayload,
    createAiRewriteRequest: createAiRewriteRequest,
    createAiRewriteResult: createAiRewriteResult
  });
})(typeof self !== 'undefined' ? self : window);
