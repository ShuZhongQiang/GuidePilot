(function initExportController(global) {
  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || '').split(',', 2);
    const header = parts[0] || '';
    const base64 = parts[1] || '';
    const match = /^data:(.*?);base64$/.exec(header);
    const mimeType = match ? match[1] : 'application/octet-stream';

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType });
  }

  function sanitizeFilename(name) {
    return String(name || '')
      .replace(/[\\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 50);
  }

  function createExportFilename(documentPayload) {
    const now = new Date();
    const pad = function pad(value) {
      return String(value).padStart(2, '0');
    };
    const timestamp = now.getFullYear()
      + pad(now.getMonth() + 1)
      + pad(now.getDate())
      + '-'
      + pad(now.getHours())
      + pad(now.getMinutes());

    var exportName = createShortExportName(documentPayload || {});

    return sanitizeFilename(exportName) + '-' + timestamp;
  }

  function createShortExportName(documentPayload) {
    if (documentPayload.exportName) {
      return documentPayload.exportName;
    }

    const title = documentPayload.title || '';
    const summary = documentPayload.summary || '';
    const semanticTokens = extractSemanticExportTokens(title + ' ' + summary);

    if (semanticTokens.length > 0) {
      return semanticTokens.join('-');
    }

    const keywords = extractExportKeywords(title);
    if (keywords.length > 0) {
      return keywords.join('-');
    }

    return 'step-guide';
  }

  function extractSemanticExportTokens(text) {
    const source = String(text || '').trim();
    if (!source) {
      return [];
    }

    const tokens = [];
    const quotedNames = source.match(/[“"]([^”"]{2,24})[”"]/g) || [];
    if (quotedNames.length > 0) {
      tokens.push(typeof normalizeExportToken === 'function'
        ? normalizeExportToken(quotedNames[0].replace(/[“”"]/g, ''))
        : quotedNames[0].replace(/[“”"]/g, ''));
    }

    const systemMatch = source.match(/([\u4e00-\u9fa5A-Za-z0-9_-]{2,24}(?:后台管理系统|管理系统|管理后台|后台|系统|平台))/i);
    if (systemMatch && systemMatch[1]) {
      tokens.push(typeof normalizeExportToken === 'function'
        ? normalizeExportToken(systemMatch[1])
        : systemMatch[1]);
    }

    const moduleMatch = source.match(/([\u4e00-\u9fa5A-Za-z0-9_-]{2,16})模块/i);
    if (moduleMatch && moduleMatch[1]) {
      tokens.push(typeof normalizeExportToken === 'function'
        ? normalizeExportToken(moduleMatch[1])
        : moduleMatch[1]);
    }

    const actionMatch = source.match(/(新增|添加|创建|登录|编辑|修改|更新|删除|搜索|查询|导出|导入|审批|发布|配置|设置)/i);
    if (actionMatch && actionMatch[1]) {
      tokens.push(typeof normalizeExportToken === 'function'
        ? normalizeExportToken(actionMatch[1])
        : actionMatch[1]);
    }

    return Array.from(new Set(tokens.filter(Boolean))).slice(0, 4);
  }

  function extractExportKeywords(title) {
    if (!title) {
      return [];
    }

    var text = String(title).trim();
    if (!text) {
      return [];
    }

    const separators = [/[-——–\s]+/];
    var parts = [text];
    for (var i = 0; i < separators.length; i++) {
      var newParts = [];
      for (var j = 0; j < parts.length; j++) {
        newParts = newParts.concat(parts[j].split(separators[i]));
      }
      parts = newParts;
    }

    var keywords = parts
      .map(function trimPart(p) { return p.trim(); })
      .filter(function nonEmpty(p) { return p.length > 0; });

    var badWords = [
      '这是', '这是一份', '这是一个', '这是一本',
      '请', '请帮我', '我想', '生成', '帮我',
      '操作', '操作手册', '操作指南', '手册', '指南',
      '文档', '说明', '教程', 'login', '登录'
    ];

    keywords = keywords.filter(function notBadWord(k) {
      var lower = k.toLowerCase();
      for (var i = 0; i < badWords.length; i++) {
        if (lower === badWords[i].toLowerCase()) {
          return false;
        }
      }
      return true;
    });

    return keywords.slice(0, 3);
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(function revokeUrl() {
      URL.revokeObjectURL(url);
    }, 2000);
  }

  function downloadBlobWithChrome(blob, filename) {
    return new Promise(function resolveDownload(resolve, reject) {
      const url = URL.createObjectURL(blob);

      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false,
        conflictAction: 'uniquify'
      }, function onDownloaded(downloadId) {
        setTimeout(function revokeUrl() {
          URL.revokeObjectURL(url);
        }, 10000);

        if (chrome.runtime.lastError || !downloadId) {
          reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'download_failed'));
          return;
        }

        resolve(downloadId);
      });
    });
  }

  async function requestDocumentBuild(sessionId, format, useAi, options) {
    const messages = global.StepRecorderMessages;
    const opts = options || {};
    const timeoutMs = Number(opts.timeoutMs) > 0
      ? Number(opts.timeoutMs)
      : (useAi ? 90000 : 45000);
    const result = await sendPanelCommand(messages.COMMAND.DOCUMENT_BUILD, {
      sessionId: sessionId,
      format: format,
      useAi: Boolean(useAi),
      prompt: opts.prompt || ''
    }, {
      timeoutMs: timeoutMs
    });

    if (!result || result.ok === false) {
      throw new Error(result && result.error ? result.error : 'document_build_failed');
    }

    return result;
  }

  async function downloadExportBundle(buildResult, options) {
    if (!buildResult || !buildResult.rendered) {
      throw new Error('invalid_build_result');
    }

    const opts = options || {};
    const rendered = buildResult.rendered;
    const documentPayload = buildResult.document;
    const rawAssets = Array.isArray(buildResult.assets) ? buildResult.assets : [];

    const exportFilename = createExportFilename(documentPayload);

    const mainBlob = new Blob([rendered.content || ''], {
      type: rendered.mimeType || 'text/plain;charset=utf-8'
    });

    var assetMap = rawAssets.map(function mapAsset(asset) {
      return {
        filename: asset.filename || ('images/' + asset.assetId + '.png'),
        original: asset
      };
    });

    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();
      zip.file(rendered.filename || 'steps-guide.md', mainBlob);

      for (var i = 0; i < assetMap.length; i++) {
        const mapping = assetMap[i];
        if (!mapping || !mapping.original || !mapping.original.dataUrl) {
          continue;
        }
        zip.file(mapping.filename, dataUrlToBlob(mapping.original.dataUrl));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerBlobDownload(zipBlob, exportFilename + '.zip');
      return;
    }

    const canUseDownloads = chrome.downloads && typeof chrome.downloads.download === 'function';

    if (canUseDownloads) {
      await downloadBlobWithChrome(mainBlob, exportFilename + '/' + (rendered.filename || 'steps-guide.md'));
      for (var j = 0; j < assetMap.length; j++) {
        const mapping = assetMap[j];
        if (!mapping || !mapping.original || !mapping.original.dataUrl) {
          continue;
        }
        await downloadBlobWithChrome(dataUrlToBlob(mapping.original.dataUrl), exportFilename + '/' + mapping.filename);
      }
      return;
    }

    triggerBlobDownload(mainBlob, rendered.filename || 'steps-guide.md');
    for (var k = 0; k < assetMap.length; k++) {
      const mapping = assetMap[k];
      if (!mapping || !mapping.original || !mapping.original.dataUrl) {
        continue;
      }
      const fileName = mapping.filename.split('/').pop() || mapping.filename;
      triggerBlobDownload(dataUrlToBlob(mapping.original.dataUrl), fileName);
    }
  }

  global.requestDocumentBuild = requestDocumentBuild;
  global.downloadExportBundle = downloadExportBundle;
})(typeof self !== 'undefined' ? self : window);
