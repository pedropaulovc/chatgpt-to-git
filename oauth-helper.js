console.log("OAuth helper page loaded");
// This page will be used to bypass CORS restrictions

// Function to be called by injected script
function performOAuthRequest(clientId) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://github.com/login/device/code', true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            try {
                const data = JSON.parse(xhr.responseText);
                browser.runtime.sendMessage({
                    action: 'deviceCodeResponse',
                    data: data
                });
            } catch (e) {
                browser.runtime.sendMessage({
                    action: 'deviceCodeError',
                    error: 'Failed to parse response: ' + e.message
                });
            }
        } else {
            browser.runtime.sendMessage({
                action: 'deviceCodeError',
                error: 'Request failed with status: ' + xhr.status
            });
        }
    };
    
    xhr.onerror = function() {
        browser.runtime.sendMessage({
            action: 'deviceCodeError',
            error: 'Network error occurred'
        });
    };
    
    const params = new URLSearchParams({
        client_id: clientId,
        scope: 'repo user:email'
    });
    xhr.send(params.toString());
}