(() => {
  'use strict';

  if (window.__alwaysActiveInjected) return;
  window.__alwaysActiveInjected = true;

  // 1. Prototype Property Spoofing
  try {
    Object.defineProperties(Document.prototype, {
      hidden: {
        get: () => false,
        configurable: true
      },
      webkitHidden: {
        get: () => false,
        configurable: true
      },
      mozHidden: {
        get: () => false,
        configurable: true
      },
      visibilityState: {
        get: () => 'visible',
        configurable: true
      },
      webkitVisibilityState: {
        get: () => 'visible',
        configurable: true
      },
      onvisibilitychange: {
        get: () => null,
        set: () => {},
        configurable: true
      }
    });
  } catch (_) {}

  // 2. Focus & Blur Property Neutralization
  try {
    Document.prototype.hasFocus = () => true;

    Object.defineProperty(window, 'onblur', {
      get: () => null,
      set: () => {},
      configurable: true
    });

    Object.defineProperty(document, 'onblur', {
      get: () => null,
      set: () => {},
      configurable: true
    });
  } catch (_) {}

  // 3. Surgical Event Interception (Capture Phase on both window & document)
  const stopEvent = (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  };

  const visibilityEvents = [
    'visibilitychange',
    'webkitvisibilitychange',
    'mozvisibilitychange',
    'pagehide'
  ];

  visibilityEvents.forEach((eventType) => {
    window.addEventListener(eventType, stopEvent, { capture: true, passive: false });
    document.addEventListener(eventType, stopEvent, { capture: true, passive: false });
  });

  // Intercept document-level mouseleave (attached to document so non-bubbling mouseleave is caught)
  const handleMouseLeave = (e) => {
    if (e.target === document || e.target === document.documentElement || e.target === window) {
      stopEvent(e);
    }
  };
  document.addEventListener('mouseleave', handleMouseLeave, { capture: true, passive: false });
  window.addEventListener('mouseleave', handleMouseLeave, { capture: true, passive: false });

  // Intercept blur & focusout ONLY at window or document level to avoid breaking form controls
  const handleFocusLoss = (e) => {
    if (e.target === window || e.target === document) {
      stopEvent(e);
    }
  };

  ['blur', 'focusout'].forEach((eventType) => {
    window.addEventListener(eventType, handleFocusLoss, { capture: true, passive: false });
    document.addEventListener(eventType, handleFocusLoss, { capture: true, passive: false });
  });
})();
