// Background script for ChatGPT Extension - Cross-browser compatible
const browser = chrome || browser;

browser.runtime.onInstalled.addListener(() => {
    console.log('ChatGPT Extension installed');
});

// GitHub OAuth functions using manual device flow
function authenticateGitHub() {
    return new Promise((resolve, reject) => {
        const clientId = 'YOUR_GITHUB_CLIENT_ID'; // Replace with actual client ID from GitHub OAuth app
        
        // Since GitHub doesn't support CORS for device flow from extensions,
        // we'll use a simplified approach: direct user to GitHub OAuth
        const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo%20user:email&redirect_uri=urn:ietf:wg:oauth:2.0:oob`;
        
        // Open GitHub OAuth in new tab
        browser.tabs.create({
            url: authUrl,
            active: true
        });
        
        // Show instructions to user
        browser.storage.local.set({
            github_auth_pending: true,
            github_auth_instructions: 'Please authorize the app and copy the authorization code'
        });
        
        // For now, we'll reject and let the user manually enter the code
        reject(new Error('Please complete authorization on GitHub and enter the code manually'));
    });
}

function exchangeCodeForToken(code) {
    return new Promise((resolve, reject) => {
        const clientId = 'YOUR_GITHUB_CLIENT_ID'; // Replace with actual client ID
        
        // Use GitHub's token exchange endpoint
        fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
            },
            body: new URLSearchParams({
                client_id: clientId,
                code: code,
                redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.access_token) {
                // Store token securely
                browser.storage.local.set({
                    github_token: data.access_token
                }, () => {
                    // Clean up auth pending state
                    browser.storage.local.remove(['github_auth_pending', 'github_auth_instructions']);
                    resolve(data.access_token);
                });
            } else {
                reject(new Error(data.error_description || 'Failed to exchange code for token'));
            }
        })
        .catch(reject);
    });
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
        console.log('Exchanging code for token');
        exchangeCodeForToken(request.code)
            .then(token => {
                sendResponse({success: true, token});
            })
            .catch(error => {
                console.error('Code exchange failed:', error);
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