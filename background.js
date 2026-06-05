var PIN_KEY = 'codegen_pinned';

// 服务工作线程启动时立即应用模式
chrome.storage.local.get(PIN_KEY, function (result) {
  applyMode(result[PIN_KEY] !== false);
});

// 首次安装 / 更新时，初始化默认值并注入到所有已打开的标签页
chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get(PIN_KEY, function (result) {
    var pinned = result[PIN_KEY] !== undefined ? result[PIN_KEY] : true;
    if (result[PIN_KEY] === undefined) {
      var data = {};
      data[PIN_KEY] = true;
      chrome.storage.local.set(data);
    }
    applyMode(pinned);
    if (pinned) {
      injectIntoAllTabs();
    }
  });
});

function applyMode(pinned) {
  chrome.action.setPopup({ popup: pinned ? '' : 'popup.html' });
}

// 向所有可注入的标签页注入 content script
function injectIntoAllTabs() {
  chrome.tabs.query({}, function (tabs) {
    tabs.forEach(function (tab) {
      if (!canInject(tab)) return;
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).catch(function () {});
    });
  });
}

function canInject(tab) {
  if (!tab.url) return false;
  // chrome://、chrome-extension://、about:、edge:// 等页面无法注入
  if (tab.url.startsWith('chrome://')) return false;
  if (tab.url.startsWith('chrome-extension://')) return false;
  if (tab.url.startsWith('about:')) return false;
  if (tab.url.startsWith('edge://')) return false;
  if (tab.url.startsWith('chrome.google.com/webstore')) return false;
  return true;
}

// 钉住模式下，点击图标收起/展开当前页面的面板
chrome.action.onClicked.addListener(function (tab) {
  chrome.tabs.sendMessage(tab.id, { action: 'toggle-panel' }, function (response) {
    if (chrome.runtime.lastError || !response) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }, function () {
        if (chrome.runtime.lastError) return;
        setTimeout(function () {
          chrome.tabs.sendMessage(tab.id, { action: 'pin' });
        }, 100);
      });
    }
  });
});

// 处理来自 popup / panel 的消息
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.action === 'setPinMode') {
    var data = {};
    data[PIN_KEY] = msg.pinned;
    chrome.storage.local.set(data);
    applyMode(msg.pinned);
    // 开启钉住时，注入到所有已打开的标签页
    if (msg.pinned) {
      injectIntoAllTabs();
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'pin') {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) { sendResponse({ ok: false }); return; }
      chrome.tabs.sendMessage(tabs[0].id, { action: 'pin' }, function (response) {
        if (chrome.runtime.lastError || !response) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ['content.js']
          }, function () {
            if (chrome.runtime.lastError) { sendResponse({ ok: false }); return; }
            setTimeout(function () {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'pin' }, function () {
                sendResponse({ ok: true });
              });
            }, 100);
          });
        } else {
          sendResponse(response);
        }
      });
    });
    return true;
  }
});
