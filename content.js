// Content script for ChatGPT integration
(function() {
    'use strict';
    
    // Initialize content script
    console.log('ChatGPT Extension content script loaded');
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'extractConversation') {
            const conversation = extractConversation();
            sendResponse({success: true, data: conversation});
        }
        
        if (request.action === 'checkConnection') {
            sendResponse({
                success: true, 
                connected: window.location.hostname.includes('chatgpt.com') || 
                          window.location.hostname.includes('chat.openai.com')
            });
        }
    });
    
    // Function to extract conversation from ChatGPT
    function extractConversation() {
        const messages = [];
        
        // Try different selectors for ChatGPT messages
        const messageSelectors = [
            '[data-message-author-role]',
            '.group.w-full',
            '.conversation-turn'
        ];
        
        for (const selector of messageSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                elements.forEach(element => {
                    const role = element.getAttribute('data-message-author-role') || 
                                (element.textContent.trim().startsWith('You') ? 'user' : 'assistant');
                    
                    // Extract text content
                    const contentElement = element.querySelector('.markdown') || 
                                         element.querySelector('.whitespace-pre-wrap') ||
                                         element;
                    
                    const content = contentElement ? contentElement.textContent.trim() : '';
                    
                    if (content && content.length > 0) {
                        messages.push({
                            role: role,
                            content: content,
                            timestamp: new Date().toISOString()
                        });
                    }
                });
                break; // Use first successful selector
            }
        }
        
        return messages;
    }
    
    // Add visual indicator when extension is active
    function addExtensionIndicator() {
        if (!document.getElementById('chatgpt-extension-indicator')) {
            const indicator = document.createElement('div');
            indicator.id = 'chatgpt-extension-indicator';
            indicator.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: #10a37f;
                color: white;
                padding: 5px 10px;
                border-radius: 5px;
                font-size: 12px;
                z-index: 10000;
                font-family: Arial, sans-serif;
            `;
            indicator.textContent = 'Extension Active';
            document.body.appendChild(indicator);
            
            // Remove indicator after 3 seconds
            setTimeout(() => {
                indicator.remove();
            }, 3000);
        }
    }
    
    // Show indicator when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addExtensionIndicator);
    } else {
        addExtensionIndicator();
    }
    
})();