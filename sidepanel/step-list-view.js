(function initStepListView(global) {
  var EMPTY_STATE_HTML = [
    '<div class="empty-state">',
    '<img src="icons/photo.svg" alt="无步骤" class="empty-icon">',
    '<p>暂无步骤记录</p>',
    '<span class="empty-hint">点击"开始"捕捉操作步骤</span>',
    '</div>'
  ].join('');

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function normalizeTargetText(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const lowerText = text.toLowerCase();
    const commonLabels = {
      'increase number': '增加数值',
      'decrease number': '减少数值',
      'clear': '清空',
      'close': '关闭'
    };
    return commonLabels[lowerText] || text;
  }

  function cleanPlaceholder(value) {
    if (!value) {
      return '';
    }
    var text = String(value).trim();
    if (!text) {
      return '';
    }
    var patterns = [
      /^请输入\s*/i,
      /^请填写\s*/i,
      /^请选择\s*/i,
      /^输入\s*/i,
      /^选择\s*/i,
      /^enter\s*/i,
      /^please\s+enter\s*/i,
      /^please\s+input\s*/i
    ];
    for (var i = 0; i < patterns.length; i++) {
      text = text.replace(patterns[i], '');
    }
    return text.trim();
  }

  function generateStepDisplayText(step) {
    const target = step.target || {};
    const actionType = step.actionType || 'click';
    const inputType = step.inputType || '';
    const hasValue = step.hasValue === true;

    const rawText = target.text || target.ariaLabel || '';
    const placeholder = target.placeholder || '';
    const targetText = normalizeTargetText(rawText) || '目标元素';
    const cleanedPlaceholder = cleanPlaceholder(placeholder);
    const cleanedTargetText = cleanPlaceholder(targetText);

    if (actionType === 'click') {
      if (inputType === 'password') {
        return '点击"' + (cleanedPlaceholder || targetText) + '"激活密码输入';
      }
      return '点击"' + targetText + '"';
    }

    if (actionType === 'input') {
      const fieldName = cleanedPlaceholder || cleanedTargetText;
      if (inputType === 'password') {
        return '输入密码到"' + fieldName + '"';
      }
      if (inputType === 'email') {
        return '在"' + fieldName + '"中输入邮箱';
      }
      if (inputType === 'select') {
        if (cleanedPlaceholder && cleanedTargetText && cleanedPlaceholder !== cleanedTargetText) {
          return '在"' + cleanedPlaceholder + '"中选择"' + cleanedTargetText + '"';
        }
        return '选择"' + (cleanedTargetText || fieldName) + '"';
      }
      return '在"' + (fieldName || '输入框') + '"中输入';
    }

    if (actionType === 'select') {
      return '选择"' + (cleanedPlaceholder || targetText) + '"';
    }

    if (actionType === 'scroll') {
      return '滚动页面查看内容';
    }

    return '操作"' + targetText + '"';
  }

  function statusLabel(status) {
    if (status === 'pending') {
      return '处理中';
    }
    if (status === 'failed') {
      return '失败';
    }
    return '就绪';
  }

  function previewMarkup(step) {
    const preview = step.preview || {};
    if (preview.dataUrl) {
      return '<img class="step-screenshot step-screenshot--interactive" src="' + escapeHtml(preview.dataUrl) + '" alt="步骤截图" title="点击预览" data-preview-open-step-id="' + escapeHtml(step.id) + '">';
    }

    if (preview.status === 'loading') {
      return '<div class="step-screenshot placeholder">Loading</div>';
    }

    if (preview.status === 'failed') {
      return '<div class="step-screenshot placeholder failed">Failed</div>';
    }

    if (preview.assetId) {
      return '<button class="step-screenshot placeholder preview-load" type="button" data-preview-step-id="' + escapeHtml(step.id) + '">Load</button>';
    }

    return '<div class="step-screenshot placeholder">No Image</div>';
  }

  function renderSteps(container, steps, options) {
    const opts = options || {};

    if (!container) {
      return;
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      container.innerHTML = EMPTY_STATE_HTML;
      return;
    }

    container.innerHTML = '';

    steps.forEach(function eachStep(step, index) {
      const stepElement = document.createElement('div');
      const status = step.status || 'ready';
      const target = step.target || {};
      const page = step.page || {};
      const text = generateStepDisplayText(step);
      const selector = target.selector || (Array.isArray(target.fallbackSelectors) ? target.fallbackSelectors[0] : '') || '';

      stepElement.className = 'step-item step-status step-status--' + status;
      stepElement.innerHTML = [
        '<div class="step-number">' + (index + 1) + '</div>',
        '<div class="step-content">',
        '<div class="step-line">',
        '<div class="step-text">' + escapeHtml(text) + '</div>',
        '<span class="step-status-badge">' + statusLabel(status) + '</span>',
        '</div>',
        '<div class="step-selector">' + escapeHtml(selector) + '</div>',
        page.title ? '<div class="step-page-title">' + escapeHtml(page.title) + '</div>' : '',
        '</div>',
        previewMarkup(step)
      ].join('');

      const previewLoadButton = stepElement.querySelector('[data-preview-step-id]');
      if (previewLoadButton) {
        previewLoadButton.addEventListener('click', function onPreviewLoad() {
          if (typeof opts.onLoadPreview === 'function') {
            const result = opts.onLoadPreview(step);
            if (result && typeof result.catch === 'function') {
              result.catch(function onLoadError(error) {
                console.error('[step-list] preview load failed:', error);
              });
            }
          }
        });
      }

      const previewOpenTrigger = stepElement.querySelector('[data-preview-open-step-id]');
      if (previewOpenTrigger) {
        previewOpenTrigger.addEventListener('click', function onPreviewOpen() {
          if (typeof opts.onOpenPreview === 'function') {
            const result = opts.onOpenPreview(step);
            if (result && typeof result.catch === 'function') {
              result.catch(function onOpenError(error) {
                console.error('[step-list] preview open failed:', error);
              });
            }
          }
        });
      }

      const stepActions = document.createElement('div');
      stepActions.className = 'step-actions';

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'step-delete-btn';
      deleteButton.title = '删除此步骤';
      deleteButton.innerHTML = '<img src="icons/trash.svg" alt="删除" class="delete-icon">';
      deleteButton.addEventListener('click', function onDelete() {
        if (typeof opts.onDeleteStep === 'function') {
          opts.onDeleteStep(step);
        }
      });

      stepActions.appendChild(deleteButton);
      stepElement.appendChild(stepActions);
      container.appendChild(stepElement);
    });
  }

  global.renderSteps = renderSteps;
  global.generateStepDisplayText = generateStepDisplayText;
})(typeof self !== 'undefined' ? self : window);
