# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a cross-browser web extension that extracts conversations from ChatGPT and provides Git integration capabilities. The extension works on both Chrome and Firefox using Manifest V3 with cross-browser compatibility patterns.

## Architecture

The extension follows a standard web extension architecture with four main components:

### Core Components

- **manifest.json**: Extension configuration with cross-browser compatibility (supports both `service_worker` and `scripts` for background)
- **background.js**: Background script handling storage, messaging, and tab management
- **content.js**: Content script injected into ChatGPT pages for conversation extraction
- **popup.html/popup.js**: Extension popup interface with Connect and Extract buttons

### Cross-Browser Compatibility

The codebase uses a cross-browser pattern:
```javascript
const browser = chrome || browser;
```

Key compatibility considerations:
- Background script supports both Chrome's `service_worker` and Firefox's `scripts` approach
- Script injection uses different APIs: Chrome's `scripting.executeScript` vs Firefox's `tabs.executeScript`
- All extension APIs use the `browser` namespace fallback for Firefox compatibility

### Message Flow

1. **Popup → Background**: Storage operations (save/get conversations)
2. **Popup → Content**: Extract conversation data from ChatGPT DOM
3. **Background → Tabs**: Badge updates and tab management

### Conversation Extraction

The content script uses multiple CSS selectors for robustness:
- `[data-message-author-role]` (primary)
- `.group.w-full` (fallback)
- `.conversation-turn` (fallback)

## Development Commands

Since this is a pure web extension without a build system, development involves:

1. **Load Extension**:
   - Chrome: Load unpacked extension from folder
   - Firefox: Load temporary add-on

2. **Testing**: Manual testing on ChatGPT pages (chatgpt.com, chat.openai.com)

3. **Debugging**: Browser console logging is extensively implemented throughout all components

4. **Version Control**: Always commit and push changes immediately after making modifications:
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin main
   ```

## Key Implementation Details

### Storage Format
Conversations are stored with timestamp-based keys: `conversation_${Date.now()}`

### Permissions Required
- `activeTab`: Access current tab
- `scripting`: Execute scripts in ChatGPT pages  
- `storage`: Save extracted conversations
- Host permissions for ChatGPT domains

### Visual Indicators
- Extension shows temporary "Extension Active" indicator on ChatGPT pages
- Badge with checkmark (✓) appears when on ChatGPT pages