// popup 中的钉住开关
document.getElementById('pinSwitch').addEventListener('click', function () {
  chrome.runtime.sendMessage({ action: 'setPinMode', pinned: true });
  chrome.runtime.sendMessage({ action: 'pin' });
  window.close();
});
