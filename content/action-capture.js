(function initActionCapture(global) {
  function buildActionDraft(input) {
    const payload = input && typeof input === 'object' ? input : {};
    const page = collectPageContext();
    const targetOverrides = payload.targetOverrides && typeof payload.targetOverrides === 'object'
      ? payload.targetOverrides
      : null;
    const target = Object.assign(
      {},
      buildTargetFingerprint(payload.targetElement),
      targetOverrides || {}
    );

    const draft = {
      actionId: payload.actionId || null,
      actionType: payload.actionType || 'click',
      inputType: payload.inputType || '',
      hasValue: payload.hasValue === true,
      valuePolicy: payload.valuePolicy || 'redacted',
      valueKind: payload.valueKind || payload.inputType || '',
      page: {
        url: page.url,
        title: page.title
      },
      target: target,
      capture: {
        strategy: 'before',
        primaryImageDataUrl: payload.primaryImageDataUrl || null,
        annotationRect: payload.annotationRect || (target && target.rect ? target.rect : null)
      },
      meta: {
        manualConfirmed: Boolean(payload.manualConfirmed),
        capturedAt: new Date().toISOString()
      }
    };

    const schemas = self.StepRecorderSchemas || null;
    if (schemas && typeof schemas.createActionDraft === 'function') {
      return schemas.createActionDraft(draft);
    }

    return draft;
  }

  async function commitCapturedStep(sessionId, draft) {
    const messages = self.StepRecorderMessages;
    const response = await sendRecorderRuntimeMessage({
      type: messages.CONTENT_TO_BACKGROUND.ACTION_COMMIT,
      payload: {
        sessionId: sessionId,
        draft: draft
      }
    });

    if (!response.ok) {
      return { ok: false, error: response.error || 'runtime_error' };
    }

    return response.response || { ok: true };
  }

  async function reportRuntimeError(errorPayload) {
    const messages = self.StepRecorderMessages;
    await sendRecorderRuntimeMessage({
      type: messages.CONTENT_TO_BACKGROUND.RUNTIME_ERROR,
      payload: errorPayload || null
    });
  }

  global.buildActionDraft = buildActionDraft;
  global.commitCapturedStep = commitCapturedStep;
  global.reportRuntimeError = reportRuntimeError;
})(typeof self !== 'undefined' ? self : window);
