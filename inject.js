(() => {
  'use strict';

  // 0. Zero-Fingerprint Re-Injection Handshake
  // Avoids defining any Symbol or property on `window` or `document`.
  const PROBE_TYPE = '__aam_handshake__';
  let alreadyInjected = false;
  try {
    const probeTarget = new EventTarget();
    probeTarget.addEventListener(PROBE_TYPE, () => {
      alreadyInjected = true;
    });
    // If our EventTarget.prototype.addEventListener wrapper is already active,
    // it intercepts PROBE_TYPE on detached EventTargets and invokes the callback immediately.
    if (alreadyInjected) return;
  } catch (_) {}

  // 1. Stealth Function.prototype.toString Spoofing via WeakMap + Proxy
  const nativeToString = Function.prototype.toString;
  const spoofedFunctions = new WeakMap();

  const registerNativeDisguise = (fn, name) => {
    try {
      Object.defineProperty(fn, 'name', { value: name, configurable: true });
      spoofedFunctions.set(fn, `function ${name}() { [native code] }`);
    } catch (_) {}
    return fn;
  };

  try {
    const toStringProxy = new Proxy(nativeToString, {
      apply(target, thisArg, args) {
        if (spoofedFunctions.has(thisArg)) {
          return spoofedFunctions.get(thisArg);
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
    spoofedFunctions.set(toStringProxy, 'function toString() { [native code] }');
    Object.defineProperty(Function.prototype, 'toString', {
      value: toStringProxy,
      writable: true,
      enumerable: false,
      configurable: true
    });
  } catch (_) {}

  // 2. Realistic Handler Storage for onvisibilitychange & onblur
  const handlerStore = new WeakMap();
  const makeEventPropDescriptor = (propName) => {
    const getter = registerNativeDisguise(function () {
      const map = handlerStore.get(this);
      return (map && map[propName]) || null;
    }, `get ${propName}`);

    const setter = registerNativeDisguise(function (val) {
      let map = handlerStore.get(this);
      if (!map) {
        map = Object.create(null);
        handlerStore.set(this, map);
      }
      map[propName] = typeof val === 'function' ? val : null;
    }, `set ${propName}`);

    return {
      get: getter,
      set: setter,
      enumerable: true,
      configurable: true
    };
  };

  // 3. Prototype Property Spoofing (preserving native `enumerable: true` and engine prefixes)
  try {
    const fakeVisibilityStateGetter = registerNativeDisguise(
      () => 'visible',
      'get visibilityState'
    );
    const fakeHiddenGetter = registerNativeDisguise(() => false, 'get hidden');

    const docProps = {
      hidden: {
        get: fakeHiddenGetter,
        enumerable: true,
        configurable: true
      },
      visibilityState: {
        get: fakeVisibilityStateGetter,
        enumerable: true,
        configurable: true
      },
      onvisibilitychange: makeEventPropDescriptor('onvisibilitychange')
    };

    if ('webkitHidden' in Document.prototype) {
      docProps.webkitHidden = {
        get: fakeHiddenGetter,
        enumerable: true,
        configurable: true
      };
    }
    if ('mozHidden' in Document.prototype) {
      docProps.mozHidden = {
        get: fakeHiddenGetter,
        enumerable: true,
        configurable: true
      };
    }
    if ('webkitVisibilityState' in Document.prototype) {
      docProps.webkitVisibilityState = {
        get: fakeVisibilityStateGetter,
        enumerable: true,
        configurable: true
      };
    }

    Object.defineProperties(Document.prototype, docProps);
  } catch (_) {}

  // 4. Focus & Blur Prototype Neutralization
  try {
    Object.defineProperty(Document.prototype, 'hasFocus', {
      value: registerNativeDisguise(() => true, 'hasFocus'),
      writable: true,
      enumerable: true,
      configurable: true
    });

    if ('onblur' in Window.prototype) {
      Object.defineProperty(Window.prototype, 'onblur', makeEventPropDescriptor('onblur'));
    } else {
      Object.defineProperty(window, 'onblur', makeEventPropDescriptor('onblur'));
    }

    if ('onblur' in Document.prototype) {
      Object.defineProperty(Document.prototype, 'onblur', makeEventPropDescriptor('onblur'));
    }
  } catch (_) {}

  // 5. EventTarget.prototype.addEventListener Interception
  // Protects against late/mid-session injection & blocks future visibility listeners cleanly.
  const visibilityEvents = new Set([
    'visibilitychange',
    'webkitvisibilitychange',
    'mozvisibilitychange'
  ]);

  try {
    const nativeAddEventListener = EventTarget.prototype.addEventListener;
    const wrappedAddEventListener = registerNativeDisguise(function (type, listener, options) {
      // Respond to our internal re-injection probe on detached EventTargets
      if (
        type === PROBE_TYPE &&
        this instanceof EventTarget &&
        !(this instanceof Node) &&
        this !== window &&
        typeof listener === 'function'
      ) {
        try {
          listener();
        } catch (_) {}
        return;
      }

      const normalizedType = typeof type === 'string' ? type.toLowerCase() : '';
      if (visibilityEvents.has(normalizedType)) {
        return;
      }
      if (
        (normalizedType === 'blur' || normalizedType === 'mouseleave') &&
        (this === window || this === document || this === document.documentElement)
      ) {
        return;
      }
      return Reflect.apply(nativeAddEventListener, this, [type, listener, options]);
    }, 'addEventListener');

    // Use nativeAddEventListener to register our own capture-phase blockers first
    const stopEvent = (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    visibilityEvents.forEach((eventType) => {
      Reflect.apply(nativeAddEventListener, window, [
        eventType,
        stopEvent,
        { capture: true, passive: false }
      ]);
      Reflect.apply(nativeAddEventListener, document, [
        eventType,
        stopEvent,
        { capture: true, passive: false }
      ]);
    });

    const handleFocusLoss = (e) => {
      if (e.target === window || e.target === document) {
        stopEvent(e);
      }
    };

    ['blur', 'focusout'].forEach((eventType) => {
      Reflect.apply(nativeAddEventListener, window, [
        eventType,
        handleFocusLoss,
        { capture: true, passive: false }
      ]);
      Reflect.apply(nativeAddEventListener, document, [
        eventType,
        handleFocusLoss,
        { capture: true, passive: false }
      ]);
    });

    const handleMouseLeave = (e) => {
      if (e.target === document || e.target === document.documentElement) {
        stopEvent(e);
      }
    };

    Reflect.apply(nativeAddEventListener, window, [
      'mouseleave',
      handleMouseLeave,
      { capture: true, passive: false }
    ]);
    Reflect.apply(nativeAddEventListener, document, [
      'mouseleave',
      handleMouseLeave,
      { capture: true, passive: false }
    ]);

    Object.defineProperty(EventTarget.prototype, 'addEventListener', {
      value: wrappedAddEventListener,
      writable: true,
      enumerable: true,
      configurable: true
    });
  } catch (_) {}
})();
