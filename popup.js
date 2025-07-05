document.addEventListener('DOMContentLoaded', function() {
    console.log('Popup DOM loaded');
    const browser = chrome || browser;
    const connectBtn = document.getElementById('connect');
    const extractBtn = document.getElementById('extract');
    const githubAuthBtn = document.getElementById('github-auth');
    const status = document.getElementById('status');
    const githubStatus = document.getElementById('github-status');

    console.log('Popup elements found:', { connectBtn, extractBtn, githubAuthBtn, status, githubStatus });

    // Check GitHub authentication status on load
    checkGitHubStatus();

    connectBtn.addEventListener('click', function() {
        console.log('Connect button clicked');
        browser.tabs.query({active: true, currentWindow: true}, function(tabs) {
            console.log('Active tabs:', tabs);
            if (tabs[0].url && (tabs[0].url.includes('chatgpt.com') || tabs[0].url.includes('chat.openai.com'))) {
                console.log('Connected to ChatGPT:', tabs[0].url);
                status.textContent = 'Connected to ChatGPT';
                status.style.backgroundColor = '#d4edda';
                status.style.color = '#155724';
            } else {
                console.log('Not on ChatGPT page:', tabs[0].url);
                status.textContent = 'Please navigate to ChatGPT first';
                status.style.backgroundColor = '#f8d7da';
                status.style.color = '#721c24';
            }
        });
    });

    extractBtn.addEventListener('click', function() {
        console.log('Extract button clicked');
        browser.tabs.query({active: true, currentWindow: true}, function(tabs) {
            console.log('Current tab for extraction:', tabs[0]);
            if (browser.scripting) {
                console.log('Using Chrome scripting API');
                browser.scripting.executeScript({
                    target: {tabId: tabs[0].id},
                    func: extractConversation
                }).then(result => {
                    console.log('Script execution result:', result);
                }).catch(error => {
                    console.error('Script execution error:', error);
                });
            } else {
                console.log('Using Firefox tabs API');
                browser.tabs.executeScript(tabs[0].id, {
                    code: `(${extractConversation.toString()})()`
                }, (result) => {
                    console.log('Script execution result:', result);
                    if (browser.runtime.lastError) {
                        console.error('Script execution error:', browser.runtime.lastError);
                    }
                });
            }
        });
    });

    githubAuthBtn.addEventListener('click', function() {
        console.log('GitHub auth button clicked');
        
        // Check if already connected
        if (githubAuthBtn.textContent === 'Disconnect GitHub') {
            // Disconnect GitHub
            browser.runtime.sendMessage({action: 'clearGitHubToken'}, function(response) {
                checkGitHubStatus();
            });
            return;
        }
        
        githubStatus.textContent = 'GitHub: Starting authentication...';
        githubStatus.style.backgroundColor = '#fff3cd';
        githubStatus.style.color = '#856404';
        
        browser.runtime.sendMessage({action: 'authenticateGitHub'}, function(response) {
            console.log('GitHub auth response:', response);
            if (response.success) {
                githubStatus.textContent = 'GitHub: Connected';
                githubStatus.style.backgroundColor = '#d4edda';
                githubStatus.style.color = '#155724';
                githubAuthBtn.textContent = 'Disconnect GitHub';
            } else {
                githubStatus.textContent = `GitHub: ${response.error || 'Authentication failed'}`;
                githubStatus.style.backgroundColor = '#f8d7da';
                githubStatus.style.color = '#721c24';
            }
        });
        
        // Show device code if available
        showDeviceCodeIfAvailable();
    });
    
    function showDeviceCodeIfAvailable() {
        // Check for device code in storage
        browser.storage.local.get(['github_user_code', 'github_verification_uri'], function(result) {
            if (result.github_user_code) {
                githubStatus.innerHTML = `
                    <div style="margin-bottom: 8px;">GitHub: Waiting for authorization</div>
                    <div style="font-size: 11px; word-break: break-all;">
                        Code: <strong>${result.github_user_code}</strong>
                    </div>
                    <div style="font-size: 11px; margin-top: 4px;">
                        Visit: <a href="${result.github_verification_uri}" target="_blank" style="color: #0366d6;">
                            github.com/login/device
                        </a>
                    </div>
                `;
                githubStatus.style.backgroundColor = '#fff3cd';
                githubStatus.style.color = '#856404';
                
                // Poll for updates
                setTimeout(checkGitHubStatus, 2000);
            }
        });
    }

    function checkGitHubStatus() {
        browser.runtime.sendMessage({action: 'getGitHubToken'}, function(response) {
            console.log('GitHub token check:', response);
            if (response.success) {
                githubStatus.textContent = 'GitHub: Connected';
                githubStatus.style.backgroundColor = '#d4edda';
                githubStatus.style.color = '#155724';
                githubAuthBtn.textContent = 'Disconnect GitHub';
            } else {
                githubStatus.textContent = 'GitHub: Not connected';
                githubStatus.style.backgroundColor = '#f0f0f0';
                githubStatus.style.color = '#333';
                githubAuthBtn.textContent = 'Connect to GitHub';
            }
        });
    }
});

function extractConversation() {
    console.log('Extract conversation function started');
    const messages = document.querySelectorAll('[data-message-author-role]');
    console.log('Found messages:', messages.length);
    const conversation = [];
    
    messages.forEach((message, index) => {
        const role = message.getAttribute('data-message-author-role');
        const content = message.querySelector('.markdown')?.textContent || 
                       message.textContent.trim();
        
        console.log(`Message ${index}:`, { role, contentLength: content?.length });
        
        if (content) {
            conversation.push({
                role: role,
                content: content
            });
        }
    });
    
    console.log('Extracted conversation:', conversation);
    console.log('Total conversation items:', conversation.length);
    console.log('Full conversation data:', JSON.stringify(conversation, null, 2));
    return conversation;
}