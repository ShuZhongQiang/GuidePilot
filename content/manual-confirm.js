(function initManualConfirm(global) {
  let activeConfirm = null;

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function cleanupConfirmOverlay() {
    if (!activeConfirm) {
      return;
    }

    if (activeConfirm.keyListener) {
      document.removeEventListener('keydown', activeConfirm.keyListener, true);
    }

    if (activeConfirm.overlay && activeConfirm.overlay.parentNode) {
      activeConfirm.overlay.parentNode.removeChild(activeConfirm.overlay);
    }

    activeConfirm = null;
  }

  function handleConfirmDecision(confirmed) {
    if (!activeConfirm) {
      return;
    }

    const resolver = activeConfirm.resolve;
    cleanupConfirmOverlay();

    if (typeof resolver === 'function') {
      resolver(Boolean(confirmed));
    }
  }

  function showConfirmOverlay(options) {
    cleanupConfirmOverlay();

    const text = options && options.text ? String(options.text) : '确认保存该步骤吗？';

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.setAttribute('data-step-recorder-ui', 'true');
    overlay.innerHTML = [
      '<div class="confirm-overlay-content">',
      '<div class="confirm-overlay-text">' + escapeHtml(text) + '</div>',
      '<div class="confirm-overlay-actions">',
      '<button class="confirm-btn confirm-save" type="button">保存 (Enter)</button>',
      '<button class="confirm-btn confirm-cancel" type="button">取消 (Esc)</button>',
      '</div>',
      '</div>'
    ].join('');

    document.documentElement.appendChild(overlay);

    return new Promise(function resolveConfirm(resolve) {
      const onSave = function onSaveClick() {
        handleConfirmDecision(true);
      };

      const onCancel = function onCancelClick() {
        handleConfirmDecision(false);
      };

      const keyListener = function onConfirmKeydown(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          handleConfirmDecision(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          handleConfirmDecision(false);
        }
      };

      const saveButton = overlay.querySelector('.confirm-save');
      const cancelButton = overlay.querySelector('.confirm-cancel');
      if (saveButton) {
        saveButton.addEventListener('click', onSave);
      }
      if (cancelButton) {
        cancelButton.addEventListener('click', onCancel);
      }

      document.addEventListener('keydown', keyListener, true);

      activeConfirm = {
        overlay: overlay,
        resolve: resolve,
        keyListener: keyListener
      };
    });
  }

  global.showConfirmOverlay = showConfirmOverlay;
  global.handleConfirmDecision = handleConfirmDecision;
})(typeof self !== 'undefined' ? self : window);
