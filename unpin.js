// 侧边栏取消钉住按钮
document.getElementById('closeBtn').addEventListener('click', function () {
  chrome.runtime.sendMessage({ action: 'unpin' });
});
