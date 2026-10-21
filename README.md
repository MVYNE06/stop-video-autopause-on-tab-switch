# Always-Active Media: Stop Videos from Auto-Pausing on Tab Switch

**Always-Active Media** is a lightweight, zero-bloat Manifest V3 browser extension for Chrome, Brave, Edge, and Firefox that prevents online learning platforms (**Udemy, Coursera, Canvas, edX, Panopto, Kaltura**) and video players from automatically pausing playback when you switch tabs, minimize the browser, or take notes on a second monitor.

---

## Why Do Videos Pause When Switching Tabs? (And How This Fixes It)

Modern learning portals and streaming websites use the browser's **Page Visibility API** (`document.hidden`, `document.visibilityState`) and window focus listeners (`window.onblur`, `visibilitychange`) to detect when you leave a tab or click onto another application. 

**Always-Active Media** injects a surgical, 50-line script into the browser's `MAIN` execution world at `document_start` to spoof these properties on `Document.prototype`—reporting that the tab is always visible and focused—while leaving normal page interactions (dropdowns, search bars, and chat apps) completely untouched.

### Key Features
* **One-Click Per-Site Toggle:** No cluttered popup menus or HTML bloat. Click the toolbar icon to toggle the blocker `ON` or `OFF` for the current website domain.
* **Protects Desktop Notifications:** Because it only runs on domains you enable, chat apps like **Slack, Discord, and WhatsApp Web** remain untouched and still send background notifications normally.
* **Cross-Origin Iframe Support:** Automatically works inside embedded third-party video players (Vimeo, Kaltura, Panopto, YouTube embeds) used by university portals.
* **Zero UI Regression:** Surgically blocks window-level `blur` and `visibilitychange` events without breaking HTML `<input>` fields, search autocomplete dropdowns, or React/Vue state transitions.
* **100% Private & Zero Telemetry:** No analytics, no external dependencies, and zero background memory drain.

---

## Supported Platforms

| Platform / Player | Prevents Tab-Switch Pause | Prevents Second-Monitor Blur Pause | Works in Embedded Iframes |
| :--- | :---: | :---: | :---: |
| **Udemy** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Coursera** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Canvas LMS / Blackboard** | ✅ Yes | ✅ Yes | ✅ Yes |
| **edX** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Panopto / Kaltura / Vimeo** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Instagram / X / TikTok Web** | ✅ Yes | ✅ Yes | ✅ Yes |

---

## Installation Instructions

### Option 1: Google Chrome, Brave, Microsoft Edge, Arc, or Opera
1. **Download the Code:** Click the green **Code** button at the top of this GitHub repository and select **Download ZIP** (or run `git clone https://github.com/YOUR_USERNAME/always-active-media.git`). Extract the ZIP folder to your computer.
2. **Open Extensions Page:** Open your browser and type `chrome://extensions` (or `edge://extensions` / `brave://extensions`) into the address bar.
3. **Enable Developer Mode:** Toggle the **Developer mode** switch on in the top-right corner.
4. **Load the Extension:** Click the **Load unpacked** button in the top-left corner and select the extracted `always-active-media` folder (the folder containing `manifest.json`).
5. **Pin to Toolbar:** Click the puzzle-piece (Extensions) icon in your browser toolbar and click the **Pin** icon next to **Always-Active Media**.

### Option 2: Mozilla Firefox (Version 128+)
1. Download and extract this repository to a folder on your computer.
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select the `manifest.json` file inside your extracted folder.

---

## How to Use

1. Open the website where your video or lecture is playing (for example, `udemy.com` or `coursera.org`).
2. Click the **Always-Active Media** icon in your browser toolbar.
3. A green **`ON`** badge will appear on the icon. The protection activates immediately—**no page refresh required**.
4. Switch tabs, minimize the window, or type notes in Notion/Word/Obsidian on a second screen. Your video will continue playing without interruption.
5. To turn it off for that website, simply click the toolbar icon again (the `ON` badge will disappear) and refresh the page.

---

## Technical Architecture

```text
always-active-media/
├── manifest.json   # Manifest V3 config (Chrome + Firefox 128+ Gecko support)
├── background.js   # Event-driven service worker (manages per-host storage & dynamic injection)
├── inject.js       # MAIN world prototype spoofing & surgical capture-phase event blocker
├── LICENSE         # MIT Open Source License
└── README.md       # Documentation
