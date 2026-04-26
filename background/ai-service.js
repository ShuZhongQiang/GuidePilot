function sanitizeJsonString(input) {
  const text = String(input || '').trim();
  if (!text) {
    return '';
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fencedMatch ? fencedMatch[1].trim() : text;
}

function normalizeAiEndpoint(endpoint) {
  const defaultEndpoint = 'https://api.openai.com/v1/chat/completions';
  const raw = String(endpoint || '').trim();

  if (!raw) {
    return defaultEndpoint;
  }

  if (/\/chat\/completions$/i.test(raw)) {
    return raw;
  }

  if (/\/v1\/?$/i.test(raw)) {
    return raw.replace(/\/?$/, '/chat/completions');
  }

  return raw.replace(/\/$/, '') + '/chat/completions';
}

function getAiRequestTimeoutMs(aiSettings) {
  const timeoutMs = Number(aiSettings && aiSettings.timeoutMs);
  if (timeoutMs > 0) {
    return timeoutMs;
  }

  return 75000;
}

function buildFallbackAiRewrite(input) {
  const schemas = self.StepRecorderSchemas || {};
  const steps = Array.isArray(input && input.steps) ? input.steps : [];
  const userPrompt = input && input.prompt ? String(input.prompt).trim() : '';
  const scenario = input && input.scenario ? String(input.scenario) : '';

  function generateFallbackTitle() {
    if (userPrompt) {
      return userPrompt;
    }
    if (scenario === 'login') {
      var pageName = '';
      if (steps.length > 0) {
        pageName = steps[0].pageTitle || steps[0].pageUrl || '';
      }
      return pageName ? pageName + ' - 登录操作手册' : '登录操作手册';
    }
    var firstPageTitle = steps.length > 0 ? (steps[0].pageTitle || '') : '';
    return firstPageTitle ? firstPageTitle + ' - 操作手册' : '操作手册';
  }

  function generateFallbackSummary() {
    if (userPrompt) {
      return '已根据用户提示整理：' + userPrompt + '\n本文档共包含 ' + steps.length + ' 个操作步骤。';
    }
    if (scenario === 'login') {
      return '本文档共包含 ' + steps.length + ' 个操作步骤，包含登录认证相关操作。';
    }
    return '本文档共包含 ' + steps.length + ' 个操作步骤，已按页面上下文自动整理。';
  }

  function generateSemanticTitle(step) {
    const targetLabel = step.targetText || '目标元素';
    const pageTitle = step.pageTitle || step.pageUrl || '当前页面';
    const actionType = step.actionType || 'click';
    const inputType = step.inputType || '';
    const placeholder = step.placeholder || '';

    if (actionType === 'input') {
      if (inputType === 'password') {
        return '输入登录密码';
      }
      if (inputType === 'email') {
        return '输入邮箱地址';
      }
      const cleaned = cleanPlaceholderForAi(placeholder || targetLabel);
      return '输入"' + cleaned + '"';
    }

    if (actionType === 'click') {
      if (targetLabel.toLowerCase().includes('登录') || targetLabel.toLowerCase().includes('login')) {
        return '点击登录按钮';
      }
      return '点击"' + targetLabel + '"';
    }

    if (actionType === 'select') {
      return '选择"' + targetLabel + '"';
    }

    if (actionType === 'scroll') {
      return '滚动页面查看内容';
    }

    return '操作"' + targetLabel + '"';
  }

  function generateSemanticInstruction(step) {
    const targetLabel = step.targetText || '目标元素';
    const pageTitle = step.pageTitle || step.pageUrl || '当前页面';
    const actionType = step.actionType || 'click';
    const inputType = step.inputType || '';
    const placeholder = step.placeholder || '';

    if (actionType === 'input') {
      if (inputType === 'password') {
        return '在密码输入框中输入你的密码（内容将以***隐藏显示）';
      }
      if (inputType === 'email') {
        return '在"' + cleanPlaceholderForAi(placeholder || targetLabel) + '"中输入邮箱地址';
      }
      return '在"' + cleanPlaceholderForAi(placeholder || targetLabel) + '"中输入内容';
    }

    if (actionType === 'click') {
      if (targetLabel.toLowerCase().includes('登录') || targetLabel.toLowerCase().includes('login')) {
        return '点击"登录"按钮提交登录请求';
      }
      return '在"' + pageTitle + '"中点击"' + targetLabel + '"';
    }

    if (actionType === 'select') {
      return '从下拉列表中选择"' + targetLabel + '"';
    }

    if (actionType === 'scroll') {
      return '滚动页面以查看更多内容';
    }

    return '在"' + pageTitle + '"中操作"' + targetLabel + '"';
  }

  const fallbackTitle = generateFallbackTitle();
  const fallbackSummary = generateFallbackSummary();

  const payload = typeof schemas.createAiRewriteResult === 'function'
    ? schemas.createAiRewriteResult({
      title: fallbackTitle,
      summary: steps.length > 0 ? fallbackSummary : '当前没有可改写的步骤。',
      sections: steps.length > 0
        ? [{ heading: '操作步骤', stepIds: steps.map(function mapStep(step) { return step.stepId; }) }]
        : [],
      rewrittenSteps: steps.map(function mapStep(step) {
        return {
          stepId: step.stepId,
          title: generateSemanticTitle(step),
          instruction: generateSemanticInstruction(step)
        };
      })
    })
    : {
      title: '操作手册',
      summary: '',
      sections: [],
      rewrittenSteps: []
    };

  return {
    ok: true,
    provider: 'fallback',
    status: 'fallback',
    output: payload
  };
}

function cleanPlaceholderForAi(value) {
  var text = String(value || '').trim();
  if (!text) {
    return '目标元素';
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
  return text.trim() || '目标元素';
}

function buildAiMessages(input) {
  const promptPayload = {
    session: input.session,
    steps: input.steps,
    language: input.language,
    userPrompt: input.prompt || '',
    scenario: input.scenario || ''
  };

  return [
    {
      role: 'system',
      content: [
        '你是一个浏览器操作文档整理助手，负责将原始操作步骤重写为清晰、专业、面向最终用户的操作指南。',
        '',
        '【核心规则】',
        '1. 标题规范：',
        '   - 不要使用"点击"作为标题开头，应使用动作意图（如"输入用户名"而非"点击用户名输入框"）',
        '   - 标题应反映用户目标，而非底层交互方式',
        '2. 指令规范：',
        '   - 使用"在...中输入..."描述输入操作',
        '   - 使用"点击...按钮"描述点击操作',
        '   - 使用"选择..."描述下拉选择操作',
        '3. 场景识别：',
        '   - 如果 scenario 字段为 "login"，这是一个登录场景',
        '   - 如果步骤包含用户名+密码+登录按钮，即使没有 scenario 也识别为登录场景',
        '   - 优先按 userPrompt 的要求组织内容',
        '4. 摘要规范：',
        '   - 简要说明本指南的目标场景',
        '   - 如有 userPrompt，将其融入摘要',
        '   - 可补充必要的注意事项或前置条件',
        '5. 标题生成：',
        '   - 如果有 userPrompt，直接使用 userPrompt 作为文档标题',
        '   - 如果 scenario 为 login，标题应为 "XXX - 登录操作手册"',
        '   - 不要使用 "AI 增强步骤指南" 这种泛化标题',
        '',
        '【字段说明】',
        '每个步骤包含：actionType(click/input/select/scroll)、inputType(text/password/email等)、placeholder、targetText、pageTitle',
        'placeholder 中可能包含"请输入/Enter"等引导词，需要在生成标题时清洗掉。',
        '请根据这些字段生成语义化的 title 和 instruction。',
        '',
        '【输出要求】',
        '只返回 JSON，不要返回 Markdown，不要解释。',
        'JSON 结构必须是 { title, summary, sections, rewrittenSteps }。',
        'sections 为数组，每项包含 { heading, stepIds }。',
        'rewrittenSteps 为数组，每项包含 { stepId, title, instruction }。'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify(promptPayload)
    }
  ];
}

async function requestOpenAiCompatibleRewrite(input, aiSettings) {
  const endpoint = normalizeAiEndpoint(aiSettings.endpoint);
  const requestTimeoutMs = getAiRequestTimeoutMs(aiSettings);
  const abortController = typeof AbortController !== 'undefined'
    ? new AbortController()
    : null;
  let didTimeout = false;
  const timeoutId = abortController
    ? setTimeout(function abortRequest() {
      didTimeout = true;
      abortController.abort();
    }, requestTimeoutMs)
    : null;

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + aiSettings.apiKey
      },
      body: JSON.stringify({
        model: aiSettings.model || 'gpt-4.1-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: buildAiMessages(input)
      }),
      signal: abortController ? abortController.signal : undefined
    });
  } catch (error) {
    if (didTimeout || (error && error.name === 'AbortError')) {
      throw new Error('ai_request_timeout');
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  if (!response.ok) {
    throw new Error('ai_http_' + response.status);
  }

  const payload = await response.json();
  const content = payload
    && payload.choices
    && payload.choices[0]
    && payload.choices[0].message
    && payload.choices[0].message.content
    ? payload.choices[0].message.content
    : '';

  if (!content) {
    throw new Error('ai_empty_response');
  }

  const schemas = self.StepRecorderSchemas || {};
  const parsed = JSON.parse(sanitizeJsonString(content));
  const output = typeof schemas.createAiRewriteResult === 'function'
    ? schemas.createAiRewriteResult(parsed)
    : parsed;

  return {
    ok: true,
    provider: 'openai-compatible',
    status: 'completed',
    model: aiSettings.model || 'gpt-4.1-mini',
    output: output
  };
}

async function rewriteDocumentWithAi(input, aiSettings) {
  const constants = self.StepRecorderConstants || {};
  const defaultAiSettings = constants.DEFAULT_AI_SETTINGS || {};
  const settings = {
    ...defaultAiSettings,
    ...(aiSettings || {})
  };

  if (!settings.apiKey) {
    return buildFallbackAiRewrite(input);
  }

  try {
    return await requestOpenAiCompatibleRewrite(input, settings);
  } catch (error) {
    console.warn('[ai-service] AI rewrite failed, using fallback:', error);
    const fallback = buildFallbackAiRewrite(input);
    fallback.error = error && error.message ? error.message : 'ai_request_failed';
    return fallback;
  }
}
