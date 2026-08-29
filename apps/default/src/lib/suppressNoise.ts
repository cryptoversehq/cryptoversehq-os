// Suppress third-party browser extension noise
// MetaMask injects at document_start; catch rejections at the earliest point after our module loads
(function suppress() {
  const SILENCE = ['MetaMask', 'Failed to connect'];
  
  window.addEventListener('unhandledrejection', (e) => {
    try {
      const msg = String(e.reason?.message ?? e.reason ?? '');
      if (SILENCE.some((s) => msg.includes(s))) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    } catch (_) { /* ignore */ }
  }, { capture: true, passive: false });

  // Also suppress via error event for good measure
  window.addEventListener('error', (e) => {
    try {
      const msg = String(e.message ?? e.error?.message ?? '');
      if (SILENCE.some((s) => msg.includes(s))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return false;
      }
    } catch (_) { /* ignore */ }
  }, { capture: true });

  // Intercept console.error to swallow MetaMask noise that leaks past event listeners
  const _origConsoleError = console.error.bind(console);
  console.error = (...args: any[]) => {
    const msg = args.map(a => String(a?.message ?? a ?? '')).join(' ');
    if (SILENCE.some(s => msg.includes(s))) return;
    _origConsoleError(...args);
  };

  // Preempt MetaMask by defining a safe proxy before MetaMask's inpage script can throw
  // Use Object.defineProperty to intercept any later assignment by the extension
  try {
    const safeProvider = {
      isMetaMask: true,
      chainId: '0x1',
      networkVersion: '1',
      selectedAddress: null,
      request: () => Promise.reject(new Error('Wallet not available in preview')),
      send: () => Promise.reject(new Error('Wallet not available in preview')),
      sendAsync: () => {},
      enable: () => Promise.reject(new Error('Wallet not available in preview')),
      on: () => {},
      removeListener: () => {},
      _metamask: { isUnlocked: () => Promise.resolve(false) },
    };

    // If MetaMask hasn't injected yet, pre-seed ethereum with a safe provider
    if (!(window as any).ethereum) {
      try {
        Object.defineProperty(window, 'ethereum', {
          value: safeProvider,
          writable: true,
          configurable: true,
        });
      } catch (_) { /* cannot define - fine */ }
    } else {
      // MetaMask already injected — wrap its dangerous methods
      const orig = (window as any).ethereum;
      const wrapSafe = (method: string) => {
        try {
          if (typeof orig[method] === 'function') {
            const fn = orig[method].bind(orig);
            orig[method] = (...args: any[]) => fn(...args).catch(() => []);
          }
        } catch (_) { /* skip */ }
      };
      wrapSafe('connect');
      wrapSafe('request');
      wrapSafe('send');
      wrapSafe('enable');
      orig._metamask = { isUnlocked: () => Promise.resolve(false) };
    }
  } catch (_) { /* MetaMask not present yet - fine */ }
})();
