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
  return '点击“' + targetText + '”';
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
  const canonicalSteps = steps.map((step, index) => {
    const seq = typeof step.seq === 'number' ? step.seq : index + 1;
    const targetText = step.target && step.target.text
      ? step.target.text
      : '目标元素';
    const selector = step.target && step.target.selector ? step.target.selector : '';
    const pageUrl = step.page && step.page.url ? step.page.url : '';
    const pageTitle = step.page && step.page.title ? step.page.title : '';
    const title = '步骤 ' + seq;

    const payload = {
      stepId: step.id,
      seq: seq,
      title: title,
      instruction: '',
      pageUrl: pageUrl,
      pageTitle: pageTitle,
      targetText: targetText,
      selector: selector,
      primaryAssetId: step.capture && step.capture.primaryAssetId
        ? step.capture.primaryAssetId
        : null
    };

    payload.instruction = buildStepInstruction(payload);
    return schemas && typeof schemas.createDocumentStep === 'function'
      ? schemas.createDocumentStep(payload)
      : payload;
  });

  return {
    session: session,
    title: '步骤指南',
    summary: '',
    sections: [],
    steps: canonicalSteps
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
    markdown += documentPayload.summary + '\n\n';
  }

  if (Array.isArray(documentPayload.sections) && documentPayload.sections.length > 0) {
    markdown += '## 目录\n\n';
    for (const section of documentPayload.sections) {
      markdown += '- ' + section.heading + '\n';
    }
    markdown += '\n';
  }

  for (const step of stepList) {
    markdown += '## 步骤 ' + step.seq + '\n\n';
    markdown += '- 标题: ' + step.title + '\n';
    markdown += '- 指令: ' + step.instruction + '\n';
    if (step.pageTitle) {
      markdown += '- 页面标题: ' + step.pageTitle + '\n';
    }
    if (step.pageUrl) {
      markdown += '- 页面地址: ' + step.pageUrl + '\n';
    }
    if (step.selector) {
      markdown += '- 选择器: `' + step.selector + '`\n';
    }

    const assetPath = resolveAssetPath(step, opts.assetPathResolver);
    if (assetPath) {
      markdown += '- 截图: ![步骤 ' + step.seq + '](' + assetPath + ')\n';
    }

    markdown += '\n';
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
  html += '  <style>body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#111;}';
  html += '.step{border:1px solid #ddd;border-radius:10px;padding:16px;margin-bottom:16px;}';
  html += '.selector{font-family:Consolas,monospace;background:#f5f5f5;padding:2px 6px;border-radius:4px;}';
  html += '.shot{max-width:100%;border-radius:8px;margin-top:10px;border:1px solid #eee;}</style>\n';
  html += '</head>\n';
  html += '<body>\n';
  html += '  <h1>' + escapeDocumentText(documentPayload.title || '步骤指南') + '</h1>\n';

  if (documentPayload.summary) {
    html += '  <p>' + escapeDocumentText(documentPayload.summary) + '</p>\n';
  }

  if (Array.isArray(documentPayload.sections) && documentPayload.sections.length > 0) {
    html += '  <nav><h2>目录</h2><ul>\n';
    for (const section of documentPayload.sections) {
      html += '    <li>' + escapeDocumentText(section.heading) + '</li>\n';
    }
    html += '  </ul></nav>\n';
  }

  for (const step of stepList) {
    const assetPath = resolveAssetPath(step, opts.assetPathResolver);
    html += '  <section class="step">\n';
    html += '    <h2>步骤 ' + step.seq + '</h2>\n';
    html += '    <p><strong>标题:</strong> ' + escapeDocumentText(step.title) + '</p>\n';
    html += '    <p><strong>指令:</strong> ' + escapeDocumentText(step.instruction) + '</p>\n';

    if (step.pageTitle) {
      html += '    <p><strong>页面标题:</strong> ' + escapeDocumentText(step.pageTitle) + '</p>\n';
    }
    if (step.pageUrl) {
      html += '    <p><strong>页面地址:</strong> ' + escapeDocumentText(step.pageUrl) + '</p>\n';
    }
    if (step.selector) {
      html += '    <p><strong>选择器:</strong> <span class="selector">' + escapeDocumentText(step.selector) + '</span></p>\n';
    }
    if (assetPath) {
      html += '    <img class="shot" src="' + escapeDocumentText(assetPath) + '" alt="步骤 ' + step.seq + '">\n';
    }

    html += '  </section>\n';
  }

  html += '</body>\n';
  html += '</html>\n';
  return html;
}
