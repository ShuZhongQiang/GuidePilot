function escapeDocumentText(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildStepInstruction(stepPayload) {
  const targetText = stepPayload.targetText || '目标元素';
  const actionType = stepPayload.actionType || 'click';
  const placeholder = cleanPlaceholder(stepPayload.placeholder) || targetText;
  const inputType = stepPayload.inputType || '';
  const hasValue = stepPayload.hasValue;
  const valuePolicy = stepPayload.valuePolicy || 'redacted';

  if (actionType === 'click') {
    if (inputType === 'password') {
      return '点击"' + placeholder + '"激活密码输入';
    }
    return '点击"' + targetText + '"';
  }

  if (actionType === 'input') {
    if (inputType === 'password') {
      return '在密码输入框中输入你的登录密码（内容将以***隐藏显示）';
    }
    if (inputType === 'email') {
      return '在"' + placeholder + '"中输入邮箱地址';
    }
    if (inputType === 'text') {
      if (hasValue) {
        return '在"' + placeholder + '"中输入内容';
      }
      return '在"' + placeholder + '"中输入内容';
    }
    return '在"' + placeholder + '"中输入内容';
  }

  if (actionType === 'scroll') {
    return '滚动页面查看内容';
  }

  return '操作"' + targetText + '"';
}

function buildStepTitle(stepPayload) {
  const targetText = stepPayload.targetText;
  const actionType = stepPayload.actionType || 'click';
  const pageTitle = stepPayload.pageTitle || '';
  const inputType = stepPayload.inputType || '';
  const placeholder = cleanPlaceholder(stepPayload.placeholder);
  const hasValue = stepPayload.hasValue;

  if (!targetText || targetText === '目标元素') {
    if (pageTitle) {
      return '在"' + pageTitle + '"页面执行操作';
    }
    return '执行操作';
  }

  if (actionType === 'input') {
    const description = placeholder || targetText;
    if (inputType === 'password') {
      return '输入登录密码';
    }
    if (inputType === 'email') {
      return '输入邮箱地址到"' + description + '"';
    }
    if (inputType === 'text') {
      return '输入"' + description + '"';
    }
    return '输入内容到"' + description + '"';
  }

  if (actionType === 'click') {
    if (inputType === 'password') {
      return '点击密码输入框';
    }
    if (targetText.toLowerCase().includes('登录') || targetText.toLowerCase().includes('login')) {
      return '点击登录按钮';
    }
    return '点击"' + targetText + '"';
  }

  if (actionType === 'select') {
    return '选择"' + (placeholder || targetText) + '"';
  }

  if (actionType === 'scroll') {
    return '滚动页面';
  }

  return '操作"' + targetText + '"';
}

function simplifyPageTitle(title) {
  if (!title) {
    return '';
  }

  const genericTitles = ['Vite + Vue', 'React App', 'Angular', 'Document', 'New Tab'];

  if (genericTitles.includes(title)) {
    return '';
  }

  return title;
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
    /^输入\s*/i,
    /^enter\s*/i,
    /^please\s+enter\s*/i,
    /^please\s+input\s*/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    text = text.replace(patterns[i], '');
  }
  return text.trim();
}

function simplifyPageUrl(url) {
  if (!url) {
    return '';
  }

  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
      return urlObj.pathname;
    }
    return urlObj.hostname + urlObj.pathname;
  } catch (e) {
    return url;
  }
}

function detectDocumentScenario(steps) {
  if (!steps || steps.length === 0) {
    return null;
  }

  const hasPassword = steps.some(function(s) { return s.inputType === 'password'; });
  const hasInput = steps.some(function(s) { return s.actionType === 'input'; });
  const hasLoginButton = steps.some(function(s) {
    return s.actionType === 'click' && s.targetText && /登录|login|sign\s*in/i.test(s.targetText);
  });

  if (hasPassword && hasLoginButton) {
    return 'login';
  }

  if (hasInput && hasPassword) {
    return 'form';
  }

  return null;
}

function generateDocumentSummary(steps) {
  if (!steps || steps.length === 0) {
    return '';
  }

  const pageCount = new Set(steps.filter(function(s) { return s.pageUrl; }).map(function(s) { return s.pageUrl; })).size;
  const stepCount = steps.length;

  const actionTypeCount = new Set(steps.map(function(s) { return s.actionType || 'click'; })).size;
  const hasPassword = steps.some(function(s) { return s.inputType === 'password'; });
  const hasInput = steps.some(function(s) { return s.actionType === 'input'; });

  let summary = '本操作指南共包含 ' + stepCount + ' 个操作步骤';

  if (pageCount > 0) {
    summary += '，涉及 ' + pageCount + ' 个页面';
  }

  if (hasPassword && hasInput) {
    summary += '。包含登录认证相关操作。';
  } else {
    summary += '。';
  }

  return summary;
}

function generateSections(steps) {
  if (!steps || steps.length === 0) {
    return [];
  }

  const sections = [];
  let currentSection = null;
  let sectionIndex = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const pageKey = step.pageUrl || 'unknown';
    const pageTitle = simplifyPageTitle(step.pageTitle) || '当前页面';
    const isPageChange = !currentSection || currentSection.pageKey !== pageKey;

    if (isPageChange) {
      sectionIndex++;
      currentSection = {
        id: 'section-' + sectionIndex,
        heading: '步骤 ' + (step.seq) + ' - ' + pageTitle,
        pageKey: pageKey,
        pageUrl: step.pageUrl,
        pageTitle: pageTitle,
        startSeq: step.seq,
        endSeq: step.seq,
        stepIndices: [i]
      };
      sections.push(currentSection);
    } else {
      currentSection.endSeq = step.seq;
      currentSection.stepIndices.push(i);
      currentSection.heading = '步骤 ' + currentSection.startSeq + ' - ' + currentSection.pageTitle;
    }
  }

  for (let j = 0; j < sections.length; j++) {
    sections[j].stepCount = sections[j].stepIndices.length;
  }

  if (sections.length === 1) {
    sections[0].heading = '操作步骤';
  }

  return sections;
}

function assignStepsToSections(steps, sections) {
  if (!sections || sections.length === 0) {
    return steps;
  }

  return steps.map(function(step, stepIndex) {
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (section.stepIndices && section.stepIndices.indexOf(stepIndex) !== -1) {
        step.sectionId = section.id;
        step.sectionHeading = section.heading;
        break;
      }
    }
    return step;
  });
}

async function buildCanonicalDocument(sessionId) {
  const schemas = self.StepRecorderSchemas || {};
  const session = sessionId ? await getSessionRecord(sessionId) : await getActiveSession();
  if (!session) {
    return {
      session: null,
      title: '步骤指南',
      summary: '',
      sections: [],
      steps: []
    };
  }

  const steps = await listSessionSteps(session.id);

  const canonicalSteps = steps.map(function(step, index) {
    const seq = typeof step.seq === 'number' ? step.seq : index + 1;
    const targetText = step.target && step.target.text
      ? step.target.text
      : '目标元素';
    const selector = step.target && step.target.selector ? step.target.selector : '';
    const pageUrl = step.page && step.page.url ? step.page.url : '';
    const pageTitle = step.page && step.page.title ? step.page.title : '';
    const actionType = step.actionType || 'click';
    const placeholder = step.target && step.target.placeholder ? step.target.placeholder : '';
    const inputType = step.inputType || '';
    const hasValue = step.hasValue === true;
    const valuePolicy = step.valuePolicy || 'redacted';
    const valueKind = step.valueKind || '';

    const payload = {
      stepId: step.id,
      seq: seq,
      title: '',
      instruction: '',
      pageUrl: simplifyPageUrl(pageUrl),
      pageTitle: simplifyPageTitle(pageTitle),
      targetText: targetText,
      actionType: actionType,
      selector: selector,
      placeholder: placeholder,
      inputType: inputType,
      hasValue: hasValue,
      valuePolicy: valuePolicy,
      valueKind: valueKind,
      primaryAssetId: step.capture && step.capture.primaryAssetId
        ? step.capture.primaryAssetId
        : null
    };

    payload.title = buildStepTitle(payload);
    payload.instruction = buildStepInstruction(payload);

    return schemas && typeof schemas.createDocumentStep === 'function'
      ? schemas.createDocumentStep(payload)
      : payload;
  });

  const sections = generateSections(canonicalSteps);
  const summary = generateDocumentSummary(canonicalSteps);
  const scenario = detectDocumentScenario(canonicalSteps);
  const stepsWithSections = assignStepsToSections(canonicalSteps, sections);

  var documentTitle = '操作指南';
  if (scenario === 'login') {
    var pageName = canonicalSteps[0].pageTitle || '系统';
    documentTitle = pageName + ' - 登录指南';
  } else if (canonicalSteps.length > 0) {
    var firstPageTitle = canonicalSteps[0].pageTitle;
    if (firstPageTitle) {
      documentTitle = firstPageTitle + ' - 操作指南';
    }
  }

  return {
    session: session,
    title: documentTitle,
    summary: summary,
    scenario: scenario,
    sections: sections,
    steps: stepsWithSections
  };
}

function resolveAssetPath(stepPayload, assetPathResolver) {
  if (!stepPayload || !stepPayload.primaryAssetId) {
    return '';
  }

  if (typeof assetPathResolver === 'function') {
    return assetPathResolver(stepPayload.primaryAssetId, stepPayload) || '';
  }

  return 'images/' + stepPayload.primaryAssetId + '.png';
}

function renderMarkdown(documentPayload, options) {
  const opts = options || {};
  const stepList = Array.isArray(documentPayload && documentPayload.steps)
    ? documentPayload.steps
    : [];

  let markdown = '# ' + (documentPayload.title || '步骤指南') + '\n\n';

  if (documentPayload.summary) {
    markdown += '> ' + documentPayload.summary + '\n\n';
    markdown += '---\n\n';
  }

  if (Array.isArray(documentPayload.sections) && documentPayload.sections.length > 0) {
    markdown += '## 步骤概览\n\n';
    var overviewItems = documentPayload.sections.map(function(section, idx) {
      return (idx + 1) + '. ' + section.heading + ' (' + section.stepCount + '个步骤)';
    });
    markdown += overviewItems.join('\n') + '\n\n';
    markdown += '---\n\n';
  }

  var currentSectionId = null;

  for (const step of stepList) {
    if (step.sectionId && step.sectionId !== currentSectionId) {
      currentSectionId = step.sectionId;
      if (step.sectionHeading) {
        markdown += '## ' + step.sectionHeading + '\n\n';
      }
    }

    markdown += '### ' + step.title + '\n\n';
    markdown += step.instruction + '\n\n';

    if (step.pageTitle) {
      markdown += '**操作位置**: ' + step.pageTitle + '\n\n';
    }

    const assetPath = resolveAssetPath(step, opts.assetPathResolver);
    if (assetPath) {
      markdown += '![步骤 ' + step.seq + '](' + assetPath + ')\n\n';
    }

    markdown += '---\n\n';
  }

  return markdown;
}

function renderHtml(documentPayload, options) {
  const opts = options || {};
  const stepList = Array.isArray(documentPayload && documentPayload.steps)
    ? documentPayload.steps
    : [];

  let html = '<!DOCTYPE html>\n';
  html += '<html lang="zh-CN">\n';
  html += '<head>\n';
  html += '  <meta charset="UTF-8">\n';
  html += '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
  html += '  <title>' + escapeDocumentText(documentPayload.title || '步骤指南') + '</title>\n';
  html += '  <style>body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#111;line-height:1.6;}';
  html += '.summary{background:#f8f9fa;padding:16px;border-radius:8px;margin-bottom:24px;border-left:4px solid #0066cc;}';
  html += '.overview{margin-bottom:24px;}';
  html += '.overview ol{padding-left:24px;}';
  html += '.section{margin-bottom:32px;}';
  html += '.section h2{border-bottom:2px solid #0066cc;padding-bottom:8px;color:#0066cc;}';
  html += '.step{background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin:16px 0;}';
  html += '.step h3{margin-top:0;color:#333;}';
  html += '.location{color:#666;font-size:0.9em;margin-bottom:12px;}';
  html += '.shot{max-width:100%;border-radius:8px;margin-top:12px;border:1px solid #eee;box-shadow:0 2px 4px rgba(0,0,0,0.1);}';
  html += 'hr{border:none;border-top:1px solid #e0e0e0;margin:24px 0;}</style>\n';
  html += '</head>\n';
  html += '<body>\n';
  html += '  <h1>' + escapeDocumentText(documentPayload.title || '步骤指南') + '</h1>\n';

  if (documentPayload.summary) {
    html += '  <div class="summary">\n';
    html += '    <p>' + escapeDocumentText(documentPayload.summary) + '</p>\n';
    html += '  </div>\n';
  }

  if (Array.isArray(documentPayload.sections) && documentPayload.sections.length > 0) {
    html += '  <div class="overview">\n';
    html += '    <h2>步骤概览</h2>\n';
    html += '    <ol>\n';
    for (var i = 0; i < documentPayload.sections.length; i++) {
      const section = documentPayload.sections[i];
      html += '      <li>' + escapeDocumentText(section.heading) + ' (' + (section.stepCount || 0) + '个步骤)</li>\n';
    }
    html += '    </ol>\n';
    html += '  </div>\n';
  }

  var hasSectionOpen = false;
  var currentSectionId = null;

  for (const step of stepList) {
    if (step.sectionId && step.sectionId !== currentSectionId) {
      if (hasSectionOpen) {
        html += '  </div>\n';
      }
      currentSectionId = step.sectionId;
      hasSectionOpen = true;
      html += '  <div class="section">\n';
      if (step.sectionHeading) {
        html += '    <h2>' + escapeDocumentText(step.sectionHeading) + '</h2>\n';
      }
    }

    const assetPath = resolveAssetPath(step, opts.assetPathResolver);
    html += '    <div class="step">\n';
    html += '      <h3>' + escapeDocumentText(step.title) + '</h3>\n';
    html += '      <p>' + escapeDocumentText(step.instruction) + '</p>\n';

    if (step.pageTitle) {
      html += '      <p class="location"><strong>操作位置:</strong> ' + escapeDocumentText(step.pageTitle) + '</p>\n';
    }

    if (assetPath) {
      html += '      <img class="shot" src="' + escapeDocumentText(assetPath) + '" alt="步骤 ' + step.seq + '">\n';
    }

    html += '    </div>\n';
  }

  if (hasSectionOpen) {
    html += '  </div>\n';
  }

  html += '</body>\n';
  html += '</html>\n';
  return html;
}
