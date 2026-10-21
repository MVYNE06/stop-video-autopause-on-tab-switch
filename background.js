/**
 * Always-Active Media - Background Service Worker
 * Manages per-domain activation, dynamic MAIN world script registration, and badge state.
 */
const SCRIPT_ID = 'always-active-main';
const BADGE_COLOR = '#10B981';

// Mutex queue to prevent race conditions during storage updates & script registration
let operationChain = Promise.resolve();
function enqueueOperation(task) {
  operationChain = operationChain.then(task, task);
  return operationChain;
}

/**
 * Normalizes a hostname by lowercasing and stripping trailing FQDN dots.
 * @param {string} host
 * @returns {string}
 */
function normalizeHost(host) {
  return typeof host === 'string' ? host.trim().toLowerCase().replace(/\.+$/, '') : '';
}

/**
 * Checks whether a hostname is a valid IPv4 or IPv6 literal.
 * @param {string} host
 * @returns {boolean}
 */
function isIpAddress(host) {
  if (host.startsWith('[') && host.endsWith(']')) return true; // IPv6
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4Match) return false;
  return ipv4Match.slice(1).every((octet) => Number(octet) <= 255);
}

/**
 * Validates that a hostname is safe to construct a Chrome match pattern.
 * @param {string} host
 * @returns {boolean}
 */
function isValidHost(host) {
  if (!host) return false;
  if (isIpAddress(host) || host === 'localhost') return true;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(host);
}

/**
 * Retrieve enabled hostnames from persistent storage.
 * @returns {Promise<string[]>}
 */
async function getEnabledHosts() {
  const data = await chrome.storage.local.get({ enabledHosts: [] });
  if (!Array.isArray(data.enabledHosts)) return [];
  return data.enabledHosts.map(normalizeHost).filter(isValidHost);
}

/**
 * Finds the matching enabled rule for a given hostname (exact or parent domain match).
 * @param {string} hostname
 * @param {string[]} hosts
 * @returns {string|null}
 */
function findMatchingHost(hostname, hosts) {
  const normalized = normalizeHost(hostname);
  if (!normalized) return null;
  for (const h of hosts) {
    if (normalized === h) return h;
    if (!isIpAddress(h) && h !== 'localhost' && h.includes('.') && normalized.endsWith(`.${h}`)) {
      return h;
    }
  }
  return null;
}

/**
 * Generates valid Chrome match patterns for a given hostname.
 * Prevents invalid wildcard patterns on localhost and IP addresses.
 * @param {string} host
 * @returns {string[]}
 */
function buildMatchPatterns(host) {
  const normalized = normalizeHost(host);
  if (!isValidHost(normalized)) return [];
  if (isIpAddress(normalized) || normalized === 'localhost' || !normalized.includes('.')) {
    return [`*://${normalized}/*`];
  }
  return [`*://${normalized}/*`, `*://*.${normalized}/*`];
}

/**
 * Synchronize registered dynamic content scripts with currently enabled hostnames.
 * @param {string[]} hosts
 */
async function syncDynamicScripts(hosts) {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch (_) {
    // Ignored: Script may not be registered yet
  }

  if (!hosts || hosts.length === 0) return;

  const matchSet = new Set();
  hosts.forEach((host) => {
    buildMatchPatterns(host).forEach((pattern) => matchSet.add(pattern));
  });

  if (matchSet.size === 0) return;

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        js: ['inject.js'],
        matches: Array.from(matchSet),
        runAt: 'document_start',
        world: 'MAIN',
        allFrames: true
      }
    ]);
  } catch (err) {
    console.error('Failed to register dynamic content scripts:', err);
  }
}

/**
 * Injects script into all frames (including cross-origin video iframes) of an enabled tab.
 * @param {number} tabId
 */
async function injectAllFrames(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['inject.js'],
      world: 'MAIN',
      injectImmediately: true
    });
  } catch (_) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['inject.js'],
        world: 'MAIN'
      });
    } catch (_) {
      // Gracefully ignore closed frames or unsupported protocols
    }
  }
}

/**
 * Updates toolbar badge for a specific tab based on enabled status.
 * @param {number} tabId
 * @param {string} [url]
 * @returns {Promise<boolean>} Whether the current tab is enabled
 */
async function updateTabBadge(tabId, url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      await chrome.action.setBadgeText({ tabId, text: '' });
      return false;
    }
    const hosts = await getEnabledHosts();
    const isEnabled = Boolean(findMatchingHost(parsed.hostname, hosts));
    await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
    await chrome.action.setBadgeText({
      tabId,
      text: isEnabled ? 'ON' : ''
    });
    return isEnabled;
  } catch (_) {
    return false;
  }
}

// 1. Toggle extension status on toolbar action click (serialized to avoid race conditions)
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !tab.url) return;
  enqueueOperation(async () => {
    try {
      const parsed = new URL(tab.url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return;
      const hostname = normalizeHost(parsed.hostname);
      if (!isValidHost(hostname)) return;

      let hosts = await getEnabledHosts();
      const matchedRule = findMatchingHost(hostname, hosts);

      if (matchedRule) {
        // Remove all rules matching this hostname/parent domain so toggling OFF always works
        hosts = hosts.filter((h) => findMatchingHost(hostname, [h]) === null);
      } else {
        hosts.push(hostname);
      }

      await chrome.storage.local.set({ enabledHosts: hosts });
      await syncDynamicScripts(hosts);
      await updateTabBadge(tab.id, tab.url);

      if (!matchedRule) {
        await injectAllFrames(tab.id);
      }
    } catch (err) {
      console.error('Failed to handle action click:', err);
    }
  });
});

// 2. Synchronize badge state & inject cross-origin iframes during and upon document load
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await updateTabBadge(tabId, tab.url);
  } catch (_) {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    await updateTabBadge(tabId, tab.url);
  }
  if ((changeInfo.status === 'loading' || changeInfo.status === 'complete') && tab.url) {
    const isEnabled = await updateTabBadge(tabId, tab.url);
    if (isEnabled) {
      await injectAllFrames(tabId);
    }
  }
});

// 3. Maintain script registration consistency on extension startup & installation
chrome.runtime.onInstalled.addListener(() => {
  enqueueOperation(async () => {
    const hosts = await getEnabledHosts();
    await syncDynamicScripts(hosts);
  });
});

chrome.runtime.onStartup.addListener(() => {
  enqueueOperation(async () => {
    const hosts = await getEnabledHosts();
    await syncDynamicScripts(hosts);
  });
});
