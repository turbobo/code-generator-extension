(function () {
  'use strict';

  if (window.__codegenInjected) return;
  window.__codegenInjected = true;

  var iframe = null;
  var toggleBtn = null;
  var isOpen = false;

  // 检查扩展上下文是否仍然有效
  function isValid() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // 安全的 chrome.runtime.sendMessage
  function safeSendMessage(msg, callback) {
    if (!isValid()) { cleanup(); return; }
    try {
      chrome.runtime.sendMessage(msg, function (response) {
        if (chrome.runtime.lastError) {
          console.warn('[码生成] 扩展已失效，请刷新页面后重新使用');
          cleanup();
          return;
        }
        if (callback) callback(response);
      });
    } catch (e) {
      cleanup();
    }
  }

  // 上下文失效时清理所有 DOM 和监听器
  function cleanup() {
    destroyPanel();
    window.removeEventListener('message', onWindowMessage);
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch (e) {}
    try { chrome.runtime.onMessage.removeListener(onRuntimeMessage); } catch (e) {}
    window.__codegenInjected = false;
  }

  // 监听存储变化（钉住状态同步）
  function onStorageChanged(changes, area) {
    if (!isValid()) { cleanup(); return; }
    if (area !== 'local' || !changes['codegen_pinned']) return;
    if (changes['codegen_pinned'].newValue) {
      createPanel();
    } else {
      destroyPanel();
    }
  }

  // 监听来自 background.js 的消息
  function onRuntimeMessage(msg, sender, sendResponse) {
    if (!isValid()) { cleanup(); return; }
    if (msg.action === 'pin') {
      createPanel();
      sendResponse({ ok: true });
    }
    if (msg.action === 'unpin') {
      destroyPanel();
      sendResponse({ ok: true });
    }
    if (msg.action === 'toggle-panel') {
      if (iframe) {
        toggleMinimize();
      } else {
        createPanel();
      }
      sendResponse({ ok: true });
    }
  }

  // 监听来自 iframe 的消息
  function onWindowMessage(e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.codegenAction === 'unpin') {
      // 通知 background 取消钉住
      safeSendMessage({ action: 'unpin' });
      destroyPanel();
    }
    if (e.data.codegenAction === 'toggleMinimize') {
      toggleMinimize();
    }
  }

  // 注册监听器
  try {
    chrome.storage.onChanged.addListener(onStorageChanged);
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    window.addEventListener('message', onWindowMessage);
  } catch (e) {
    // 扩展上下文已失效，静默退出
    window.__codegenInjected = false;
    return;
  }

  // 页面加载时检查钉住状态
  try {
    chrome.storage.local.get('codegen_pinned', function (result) {
      if (chrome.runtime.lastError) return;
      if (result && result['codegen_pinned']) {
        createPanel();
      }
    });
  } catch (e) {
    // 扩展上下文已失效
    window.__codegenInjected = false;
  }

  function createPanel() {
    if (iframe) {
      if (!isOpen) toggleMinimize();
      return;
    }

    var panelUrl;
    try {
      panelUrl = chrome.runtime.getURL('panel.html');
    } catch (e) {
      return;
    }

    iframe = document.createElement('iframe');
    iframe.src = panelUrl;
    iframe.id = 'codegen-float-panel';
    iframe.style.cssText = [
      'position:fixed',
      'top:0',
      'right:0',
      'width:400px',
      'height:100vh',
      'border:none',
      'z-index:2147483647',
      'box-shadow:-4px 0 24px rgba(0,0,0,0.15)',
      'transition:transform 0.3s cubic-bezier(0.4,0,0.2,1)',
      'transform:translateX(0)'
    ].join(';');
    document.documentElement.appendChild(iframe);

    toggleBtn = document.createElement('div');
    toggleBtn.id = 'codegen-toggle-btn';
    toggleBtn.innerHTML = '<span style="font-size:14px">📱</span><span style="font-size:10px;writing-mode:vertical-lr;margin-top:4px">码生成</span>';
    toggleBtn.style.cssText = [
      'position:fixed',
      'top:50%',
      'right:400px',
      'transform:translateY(-50%)',
      'width:32px',
      'padding:8px 0',
      'background:linear-gradient(135deg,#667eea,#764ba2)',
      'color:white',
      'border-radius:8px 0 0 8px',
      'cursor:pointer',
      'z-index:2147483647',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'box-shadow:-2px 0 8px rgba(0,0,0,0.1)',
      'transition:right 0.3s cubic-bezier(0.4,0,0.2,1)',
      'user-select:none'
    ].join(';');
    toggleBtn.title = '收起/展开';
    toggleBtn.addEventListener('click', toggleMinimize);
    document.documentElement.appendChild(toggleBtn);

    isOpen = true;
  }

  function destroyPanel() {
    if (iframe) { iframe.remove(); iframe = null; }
    if (toggleBtn) { toggleBtn.remove(); toggleBtn = null; }
    isOpen = false;
  }

  function toggleMinimize() {
    if (!iframe) return;
    isOpen = !isOpen;
    if (isOpen) {
      iframe.style.transform = 'translateX(0)';
      toggleBtn.style.right = '400px';
    } else {
      iframe.style.transform = 'translateX(100%)';
      toggleBtn.style.right = '0';
    }
  }
})();
