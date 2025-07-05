// Background script for ChatGPT Extension - Cross-browser compatible
const browser = chrome || browser;

browser.runtime.onInstalled.addListener(() => {
    console.log('ChatGPT Extension installed');
});

// GitHub OAuth functions - fallback to manual token entry for Firefox
function authenticateGitHub() {
    return new Promise((resolve, reject) => {
        // Since Firefox has CORS issues, we'll provide a manual token entry option
        const githubTokenUrl = 'https://github.com/settings/tokens/new?scopes=repo,user:email&description=ChatGPT%20Extension';
        
        // Store auth state
        browser.storage.local.set({
            github_auth_pending: true,
            github_auth_instructions: 'Please create a Personal Access Token at GitHub and enter it in the extension popup.'
        });
        
        // Open GitHub token creation page
        browser.tabs.create({
            url: githubTokenUrl,
            active: true
        }).then((tab) => {
            console.log('Opened GitHub token creation page');
            
            // Reject with instructions for manual token entry
            reject(new Error('Please create a Personal Access Token at GitHub and enter it in the extension popup.'));
        }).catch((error) => {
            console.error('Failed to open GitHub token page:', error);
            reject(new Error('Failed to open GitHub token page: ' + error.message));
        });
    });
}

// Function to manually set GitHub token
function setGitHubToken(token) {
    return new Promise((resolve, reject) => {
        if (!token || token.trim() === '') {
            reject(new Error('Token cannot be empty'));
            return;
        }
        
        // Validate token by making a test API call
        const xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://api.github.com/user', true);
        xhr.setRequestHeader('Authorization', `token ${token.trim()}`);
        xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');
        
        xhr.onload = function() {
            if (xhr.status === 200) {
                try {
                    const userData = JSON.parse(xhr.responseText);
                    // Token is valid, store it
                    browser.storage.local.set({
                        github_token: token.trim()
                    }, () => {
                        browser.storage.local.remove(['github_auth_pending', 'github_auth_instructions']);
                        resolve({
                            token: token.trim(),
                            user: userData
                        });
                    });
                } catch (e) {
                    reject(new Error('Failed to parse user data: ' + e.message));
                }
            } else {
                reject(new Error('Invalid token or API error. Status: ' + xhr.status));
            }
        };
        
        xhr.onerror = function() {
            reject(new Error('Network error while validating token'));
        };
        
        xhr.send();
    });
}

function handleDeviceCodeResponse(data, clientId, resolve, reject) {
    console.log('Device code response:', data);
    if (data.device_code) {
        // Store device code and start polling
        browser.storage.local.set({
            github_auth_pending: true,
            github_auth_instructions: `Please visit ${data.verification_uri} and enter code: ${data.user_code}`,
            github_device_code: data.device_code,
            github_verification_uri: data.verification_uri,
            github_user_code: data.user_code
        });
        
        // Open verification URL
        console.log('Opening verification URL:', data.verification_uri);
        console.log('Browser object:', browser);
        console.log('Browser tabs:', browser.tabs);
        
        // Try creating tab
        if (browser.tabs && browser.tabs.create) {
            browser.tabs.create({
                url: data.verification_uri,
                active: true
            }).then((tab) => {
                console.log('Tab created successfully:', tab.id);
            }).catch((error) => {
                console.error('Failed to create tab:', error);
            });
        } else {
            console.error('browser.tabs.create not available');
        }
        
        // Start polling for token
        pollForToken(clientId, data.device_code, data.interval || 5, resolve, reject);
    } else {
        reject(new Error(data.error_description || 'Failed to get device code'));
    }
}

function pollForToken(clientId, deviceCode, interval, resolve, reject, attempts = 0) {
    // Maximum attempts to prevent infinite polling
    if (attempts > 120) { // 10 minutes max
        reject(new Error('Authentication timeout'));
        return;
    }
    
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://github.com/login/oauth/access_token', true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            try {
                const data = JSON.parse(xhr.responseText);
                if (data.access_token) {
                    // Success! Store token and clean up
                    browser.storage.local.set({
                        github_token: data.access_token
                    }, () => {
                        browser.storage.local.remove([
                            'github_auth_pending', 
                            'github_auth_instructions',
                            'github_device_code',
                            'github_verification_uri',
                            'github_user_code'
                        ]);
                        resolve(data.access_token);
                    });
                } else if (data.error === 'authorization_pending') {
                    // User hasn't authorized yet, continue polling
                    setTimeout(() => {
                        pollForToken(clientId, deviceCode, interval, resolve, reject, attempts + 1);
                    }, interval * 1000);
                } else if (data.error === 'slow_down') {
                    // GitHub requests slower polling
                    setTimeout(() => {
                        pollForToken(clientId, deviceCode, interval + 5, resolve, reject, attempts + 1);
                    }, (interval + 5) * 1000);
                } else {
                    // Error occurred
                    reject(new Error(data.error_description || data.error || 'Authentication failed'));
                }
            } catch (e) {
                reject(new Error('Failed to parse response: ' + e.message));
            }
        } else {
            reject(new Error('Request failed with status: ' + xhr.status));
        }
    };
    
    xhr.onerror = function() {
        reject(new Error('Network error occurred'));
    };
    
    const params = new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    });
    xhr.send(params.toString());
}

// Legacy function - no longer needed with device flow
// Kept for backward compatibility if needed
function exchangeCodeForToken(code) {
    return Promise.reject(new Error('Manual code exchange not supported with device flow'));
}

function getGitHubToken() {
    return new Promise((resolve, reject) => {
        browser.storage.local.get(['github_token'], (result) => {
            if (result.github_token) {
                resolve(result.github_token);
            } else {
                reject(new Error('No GitHub token found'));
            }
        });
    });
}

function clearGitHubToken() {
    return new Promise((resolve) => {
        browser.storage.local.remove(['github_token'], () => {
            resolve();
        });
    });
}

// Handle messages from content script and popup
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    console.log('Message sender:', sender);
    
    if (request.action === 'saveConversation') {
        console.log('Saving conversation with data length:', request.data?.length);
        // Save conversation to local storage
        browser.storage.local.set({
            [`conversation_${Date.now()}`]: request.data
        }, () => {
            console.log('Conversation saved successfully');
            sendResponse({success: true});
        });
        return true; // Keep message channel open for async response
    }
    
    if (request.action === 'getConversations') {
        console.log('Retrieving saved conversations');
        // Retrieve saved conversations
        browser.storage.local.get(null, (result) => {
            console.log('Raw storage result:', result);
            const conversations = Object.keys(result)
                .filter(key => key.startsWith('conversation_'))
                .map(key => ({
                    id: key,
                    data: result[key]
                }));
            console.log('Filtered conversations:', conversations);
            sendResponse({success: true, conversations});
        });
        return true;
    }
    
    if (request.action === 'authenticateGitHub') {
        console.log('Starting GitHub authentication');
        authenticateGitHub()
            .then(token => {
                console.log('GitHub authentication successful');
                sendResponse({success: true, token});
            })
            .catch(error => {
                console.error('GitHub authentication failed:', error);
                sendResponse({success: false, error: error.message});
            });
        return true;
    }
    
    if (request.action === 'getGitHubToken') {
        console.log('Getting GitHub token');
        getGitHubToken()
            .then(token => {
                sendResponse({success: true, token});
            })
            .catch(error => {
                sendResponse({success: false, error: error.message});
            });
        return true;
    }
    
    if (request.action === 'clearGitHubToken') {
        console.log('Clearing GitHub token');
        clearGitHubToken()
            .then(() => {
                sendResponse({success: true});
            });
        return true;
    }
    
    if (request.action === 'exchangeCodeForToken') {
        console.log('Code exchange not supported with device flow');
        sendResponse({success: false, error: 'Manual code exchange not supported with device flow'});
        return true;
    }
    
    if (request.action === 'setGitHubToken') {
        console.log('Setting GitHub token manually');
        setGitHubToken(request.token)
            .then(result => {
                sendResponse({success: true, result});
            })
            .catch(error => {
                console.error('Token validation failed:', error);
                sendResponse({success: false, error: error.message});
            });
        return true;
    }
    
    if (request.action === 'createGitHubRepo') {
        console.log('Creating GitHub repository');
        getGitHubToken()
            .then(token => {
                return createGitHubRepository(token, request.repoName, request.description);
            })
            .then(repo => {
                sendResponse({success: true, repo});
            })
            .catch(error => {
                console.error('GitHub repo creation failed:', error);
                sendResponse({success: false, error: error.message});
            });
        return true;
    }
    
    if (request.action === 'commitToGitHub') {
        console.log('Committing to GitHub repository');
        getGitHubToken()
            .then(token => {
                return commitToGitHub(token, request.owner, request.repo, request.filename, request.content, request.message);
            })
            .then(result => {
                sendResponse({success: true, result});
            })
            .catch(error => {
                console.error('GitHub commit failed:', error);
                sendResponse({success: false, error: error.message});
            });
        return true;
    }
    
    console.log('Unknown action:', request.action);
});

// GitHub API functions
function createGitHubRepository(token, name, description) {
    return fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: name,
            description: description || 'Repository created by ChatGPT Extension',
            private: false
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.id) {
            return data;
        } else {
            throw new Error(data.message || 'Failed to create repository');
        }
    });
}

function commitToGitHub(token, owner, repo, filename, content, message) {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`;
    
    return fetch(apiUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: message || 'Add conversation from ChatGPT Extension',
            content: btoa(content), // Base64 encode the content
            branch: 'main'
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.content) {
            return data;
        } else {
            throw new Error(data.message || 'Failed to commit to repository');
        }
    });
}

function getGitHubUser(token) {
    return fetch('https://api.github.com/user', {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.login) {
            return data;
        } else {
            throw new Error('Failed to get user info');
        }
    });
}

// Handle extension icon click
const actionAPI = browser.action || browser.browserAction;
actionAPI.onClicked.addListener((tab) => {
    console.log('Extension icon clicked on tab:', tab.url);
    if (tab.url && (tab.url.includes('chatgpt.com') || tab.url.includes('chat.openai.com'))) {
        // Extension is already configured to show popup
        console.log('Opening popup on ChatGPT page');
    } else {
        // Redirect to ChatGPT if not already there
        console.log('Redirecting to ChatGPT');
        browser.tabs.create({url: 'https://chatgpt.com'});
    }
});

// Monitor tab updates to detect ChatGPT navigation
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    console.log('Tab updated:', { tabId, changeInfo, url: tab.url });
    if (changeInfo.status === 'complete' && tab.url &&
        (tab.url.includes('chatgpt.com') || tab.url.includes('chat.openai.com'))) {
        console.log('Setting badge for ChatGPT page');
        // Update extension icon to show it's active
        actionAPI.setBadgeText({
            text: '✓',
            tabId: tabId
        });
        actionAPI.setBadgeBackgroundColor({
            color: '#10a37f',
            tabId: tabId
        });
    }
});