let isRecording = false;
let overlay = null;
const NATIVE_CAPTURE_RETRIES = 2;
const NATIVE_CAPTURE_RETRY_DELAY_MS = 80;
const STRONG_INTERACTIVE_SELECTOR = 'a,button,input,textarea,select,option,[role="button"],[role="link"],[contenteditable="true"]';
const CARD_LIKE_PATTERN = /(card|item|panel|tile|list|row|cell|module|block|box|content)/i;

function init() {
  createOverlay();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startRecording') {
      startRecording();
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === 'stopRecording') {
      stopRecording();
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });
}

function createOverlay() {
  if (overlay) {
    return;
  }

  overlay = document.createElement('div');
  overlay.className = 'recording-overlay';
  document.documentElement.appendChild(overlay);
}

function startRecording() {
  if (isRecording) {
    console.log('[recording] already started');
    return;
  }

  isRecording = true;
  document.addEventListener('click', handleClick, true);
  console.log('[recording] started');
}

function stopRecording() {
  if (!isRecording) {
    console.log('[recording] already stopped');
    return;
  }

  isRecording = false;
  document.removeEventListener('click', handleClick, true);
  clearHighlights();
  console.log('[recording] stopped');
}

async function handleClick(event) {
  if (!isRecording) {
    return;
  }

  const rawTarget = event.target;
  if (!(rawTarget instanceof Element)) {
    return;
  }

  const target = resolveClickTarget(rawTarget, event);
  const highlightRect = highlightElement(target);
  const selector = getSelector(target);
  const text = getElementText(target);
  const stepId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  chrome.runtime.sendMessage({
    action: 'captureStep',
    stepId,
    type: 'click',
    selector,
    text,
    screenshot: null
  }, (response) => {
    if (response && response.ok) {
      return;
    }
    console.error('[captureStep] failed:', chrome.runtime.lastError);
  });

  let screenshot = null;
  try {
    screenshot = await captureScreenshot(highlightRect);
  } finally {
    clearHighlights();
  }

  if (!screenshot) {
    console.warn('[captureScreenshot] failed');
    return;
  }

  chrome.runtime.sendMessage({
    action: 'updateStepScreenshot',
    stepId,
    screenshot
  }, (response) => {
    if (response && response.ok) {
      return;
    }
    console.error('[updateStepScreenshot] failed:', chrome.runtime.lastError);
  });
}

function resolveClickTarget(element, event) {
  if (isStrongInteractiveElement(element)) {
    return element;
  }

  const originRect = element.getBoundingClientRect();
  const originArea = Math.max(originRect.width * originRect.height, 1);
  const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
  const clickX = event.clientX;
  const clickY = event.clientY;

  let bestElement = element;
  let bestScore = 0;
  let current = element.parentElement;
  let depth = 0;

  while (current && current !== document.body && depth < 8) {
    const rect = current.getBoundingClientRect();
    const area = rect.width * rect.height;

    if (area >= 1 && containsPoint(rect, clickX, clickY)) {
      const growth = area / originArea;
      const areaRatio = area / viewportArea;
      const cardLike = isCardLikeElement(current);
      const clickableContainer = hasClickableContainerHint(current);

      let score = 0;
      if (cardLike) {
        score += 3;
      }
      if (clickableContainer) {
        score += 2;
      }
      if (growth > 1.4) {
        score += Math.min(3, Math.log2(growth));
      }
      if (areaRatio > 0.55) {
        score -= 4;
      } else if (areaRatio > 0.35) {
        score -= 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestElement = current;
      }
    }

    current = current.parentElement;
    depth += 1;
  }

  return bestElement;
}

function isStrongInteractiveElement(element) {
  if (element.matches(STRONG_INTERACTIVE_SELECTOR)) {
    return true;
  }

  const nearestInteractive = element.closest(STRONG_INTERACTIVE_SELECTOR);
  return nearestInteractive === element;
}

function hasClickableContainerHint(element) {
  if (element.hasAttribute('onclick') || element.hasAttribute('data-click') || element.hasAttribute('data-action')) {
    return true;
  }

  const style = window.getComputedStyle(element);
  if (style.cursor === 'pointer') {
    return true;
  }

  const role = element.getAttribute('role');
  if (role === 'button' || role === 'link') {
    return true;
  }

  return false;
}

function isCardLikeElement(element) {
  const className = typeof element.className === 'string' ? element.className : '';
  const id = element.id || '';
  const role = element.getAttribute('role') || '';
  const dataType = element.getAttribute('data-type') || '';
  const hintText = `${className} ${id} ${role} ${dataType}`.toLowerCase();

  if (CARD_LIKE_PATTERN.test(hintText)) {
    return true;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 140 && rect.height > 70 && element.childElementCount >= 2;
}

function containsPoint(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function highlightElement(element) {
  clearHighlights();

  if (!overlay) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const highlight = document.createElement('div');
  highlight.className = 'highlight-element';

  // Overlay is fixed to viewport, so use viewport coordinates.
  highlight.style.top = `${rect.top}px`;
  highlight.style.left = `${rect.left}px`;
  highlight.style.width = `${rect.width}px`;
  highlight.style.height = `${rect.height}px`;

  overlay.appendChild(highlight);

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  };
}

function clearHighlights() {
  if (!overlay) {
    return;
  }

  while (overlay.firstChild) {
    overlay.removeChild(overlay.firstChild);
  }
}

function getSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }

  if (typeof element.className === 'string' && element.className.trim() !== '') {
    const classes = element.className
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((className) => `.${className}`)
      .join('');

    if (classes) {
      return `${element.tagName.toLowerCase()}${classes}`;
    }
  }

  let selector = element.tagName.toLowerCase();
  let currentElement = element;
  let parent = currentElement.parentElement;

  while (parent && parent.tagName !== 'BODY') {
    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(currentElement) + 1;

    selector = siblings.length > 1
      ? `${parent.tagName.toLowerCase()}>${selector}:nth-child(${index})`
      : `${parent.tagName.toLowerCase()}>${selector}`;

    currentElement = parent;
    parent = parent.parentElement;
  }

  return selector;
}

function getElementText(element) {
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    return normalizeText(element.placeholder || element.value || element.name || element.type || '');
  }

  if (element.tagName === 'BUTTON' || element.tagName === 'A') {
    return normalizeText(element.textContent.trim() || element.innerText.trim() || element.title || element.alt || '');
  }

  const heading = element.querySelector('h1,h2,h3,h4,h5,h6,.title,.name,[data-title]');
  if (heading) {
    const headingText = normalizeText(heading.textContent || heading.innerText || '');
    if (headingText) {
      return headingText;
    }
  }

  return normalizeText(
    element.textContent.trim() ||
    element.innerText.trim() ||
    element.title ||
    element.alt ||
    element.tagName
  );
}

function normalizeText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

async function captureScreenshot(highlightRect) {
  await waitForPaint(2);

  const nativeScreenshot = await captureVisibleTabWithRetry();
  if (nativeScreenshot) {
    return annotateScreenshot(nativeScreenshot, highlightRect);
  }

  if (typeof html2canvas !== 'undefined') {
    try {
      const canvas = await html2canvas(document.documentElement, {
        scale: window.devicePixelRatio || 1,
        logging: false,
        useCORS: true,
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight
      });

      return annotateScreenshot(canvas.toDataURL('image/png'), highlightRect);
    } catch (error) {
      console.warn('[captureScreenshot] html2canvas fallback failed:', error);
    }
  }

  return null;
}

async function captureVisibleTabWithRetry() {
  for (let attempt = 0; attempt <= NATIVE_CAPTURE_RETRIES; attempt += 1) {
    const result = await captureVisibleTab();
    if (result.screenshot) {
      return result.screenshot;
    }

    if (result.error) {
      console.warn('[captureVisibleTab] attempt failed:', result.error);
    }

    if (attempt < NATIVE_CAPTURE_RETRIES) {
      await delay(NATIVE_CAPTURE_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  return null;
}

function captureVisibleTab() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'captureTab' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ screenshot: null, error: chrome.runtime.lastError.message || 'runtime_error' });
        return;
      }

      resolve({
        screenshot: response && response.screenshot ? response.screenshot : null,
        error: response && response.error ? response.error : null
      });
    });
  });
}

function annotateScreenshot(dataUrl, highlightRect) {
  if (!dataUrl || !highlightRect) {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;

      const context = canvas.getContext('2d');
      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0);

      const viewportWidth = Math.max(window.innerWidth, 1);
      const viewportHeight = Math.max(window.innerHeight, 1);
      const scaleX = image.width / viewportWidth;
      const scaleY = image.height / viewportHeight;

      const x = Math.max(0, highlightRect.left) * scaleX;
      const y = Math.max(0, highlightRect.top) * scaleY;
      const width = Math.max(1, highlightRect.width * scaleX);
      const height = Math.max(1, highlightRect.height * scaleY);
      const lineWidth = Math.max(2, Math.round(((scaleX + scaleY) / 2) * 3));

      context.fillStyle = 'rgba(239, 68, 68, 0.16)';
      context.strokeStyle = '#ef4444';
      context.lineWidth = lineWidth;
      context.fillRect(x, y, width, height);
      context.strokeRect(x, y, width, height);

      const radius = Math.max(4, Math.round(lineWidth * 1.5));
      context.beginPath();
      context.arc(x + width / 2, y + height / 2, radius, 0, Math.PI * 2);
      context.fillStyle = '#ef4444';
      context.fill();

      resolve(canvas.toDataURL('image/png'));
    };

    image.onerror = () => {
      resolve(dataUrl);
    };

    image.src = dataUrl;
  });
}

function waitForPaint(frames = 1) {
  return new Promise((resolve) => {
    const tick = (remaining) => {
      if (remaining <= 0) {
        resolve();
        return;
      }

      requestAnimationFrame(() => tick(remaining - 1));
    };

    tick(frames);
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

init();
