/**
 * Always-Active Media - Background Service Worker
 * Manages per-domain activation, dynamic MAIN world script registration, and badge state.
 */

const SCRIPT_ID = 'always-active-main';
const BADGE_COLOR = '#10B981';

/**
 * Retrieve enabled hostnames from persistent storage.
 * @returns {Promise<string[]>}
 */
async function getEnabledHosts() {
  const data = await chrome.storage.local.get({ enabledHosts: [] });
  return Array.isArray(data.enabledHosts) ? data.enabledHosts : [];
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

  const matches = [];
  hosts.forEach((host) => {
    matches.push(`*://*.${host}/*`, `*://${host}/*`);
  });

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        js: ['inject.js'],
        matches,
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
    // Fallback for browsers that don't support injectImmediately
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['inject.js'],
        world: 'MAIN'
      });
    } catch (_) {}
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
    const isEnabled = hosts.includes(parsed.hostname);

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

// 1. Toggle extension status on toolbar action click
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  try {
    const parsed = new URL(tab.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return;

    const hostname = parsed.hostname;
    let hosts = await getEnabledHosts();
    const isEnabled = hosts.includes(hostname);

    if (isEnabled) {
      hosts = hosts.filter((h) => h !== hostname);
    } else {
      hosts.push(hostname);
    }

    await chrome.storage.local.set({ enabledHosts: hosts });
    await syncDynamicScripts(hosts);
    await updateTabBadge(tab.id, tab.url);

    // If enabling, inject into current page and all child iframes immediately
    if (!isEnabled) {
      await injectAllFrames(tab.id);
    }
  } catch (err) {
    console.error('Failed to handle action click:', err);
  }
});

// 2. Synchronize badge state & ensure cross-origin child iframes are injected
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await updateTabBadge(tabId, tab.url);
  } catch (_) {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.status === 'complete' || changeInfo.url) {
    const isEnabled = await updateTabBadge(tabId, tab.url);
    // Ensure cross-origin embedded video iframes inside enabled sites also get injected
    if (isEnabled && (changeInfo.status === 'loading' || changeInfo.status === 'complete')) {
      await injectAllFrames(tabId);
    }
  }
});

// 3. Maintain script registration consistency on extension startup & installation
chrome.runtime.onInstalled.addListener(async () => {
  const hosts = await getEnabledHosts();
  await syncDynamicScripts(hosts);
});

chrome.runtime.onStartup.addListener(async () => {
  const hosts = await getEnabledHosts();
  await syncDynamicScripts(hosts);
});
