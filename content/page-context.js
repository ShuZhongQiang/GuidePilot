(function initPageContext(global) {
  function collectPageContext() {
    return {
      url: window.location.href,
      title: document.title || '',
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    };
  }

  global.collectPageContext = collectPageContext;
})(typeof self !== 'undefined' ? self : window);
