(function () {
  'use strict';

  // ===== 常量 =====
  var MAX_HISTORY = 30;
  var MAX_BATCH = 50;
  var STORAGE_KEY = 'codegen_history';
  var STATE_KEY = 'codegen_panel_state';

  // ===== 状态 =====
  var currentType = 'qrcode';
  var debounceTimer = null;
  var historyData = [];

  // ===== DOM =====
  var toggleBtns = document.querySelectorAll('.toggle-btn');
  var barcodeOptions = document.getElementById('barcodeOptions');
  var barcodeFormat = document.getElementById('barcodeFormat');
  var inputText = document.getElementById('inputText');
  var generateBtn = document.getElementById('generateBtn');
  var clearBtn = document.getElementById('clearBtn');
  var downloadAllBtn = document.getElementById('downloadAllBtn');
  var results = document.getElementById('results');
  var codeGrid = document.getElementById('codeGrid');
  var resultCount = document.getElementById('resultCount');
  var emptyState = document.getElementById('emptyState');
  var errorMsg = document.getElementById('errorMsg');

  // Tab & History DOM
  var tabBtns = document.querySelectorAll('.tab-btn');
  var tabGenerate = document.getElementById('tabGenerate');
  var tabHistory = document.getElementById('tabHistory');
  var historyBadge = document.getElementById('historyBadge');
  var historyCount = document.getElementById('historyCount');
  var historyList = document.getElementById('historyList');
  var historyEmpty = document.getElementById('historyEmpty');
  var clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // ===== 安全检测 chrome API 是否可用 =====
  var hasStorage = false;
  try { hasStorage = !!(chrome && chrome.storage && chrome.storage.local && chrome.runtime && chrome.runtime.id); } catch (e) {}

  // ===== 状态持久化 =====
  function saveState() {
    if (!hasStorage) return;
    try {
      var state = {
        inputText: inputText.value,
        currentType: currentType,
        barcodeFormat: barcodeFormat.value
      };
      var data = {};
      data[STATE_KEY] = state;
      chrome.storage.local.set(data);
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
  }

  function loadState() {
    if (!hasStorage) return;
    try {
      chrome.storage.local.get(STATE_KEY, function (result) {
        if (chrome.runtime.lastError || !result || !result[STATE_KEY]) return;
        var state = result[STATE_KEY];
        if (state.inputText) {
          inputText.value = state.inputText;
        }
        if (state.currentType) {
          currentType = state.currentType;
          toggleBtns.forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-type') === currentType);
          });
          barcodeOptions.classList.toggle('show', currentType === 'barcode');
        }
        if (state.barcodeFormat) {
          barcodeFormat.value = state.barcodeFormat;
        }
        // 如果有内容，自动生成
        if (inputText.value.trim()) {
          autoGenerate();
        }
      });
    } catch (e) {
      console.warn('Failed to load state:', e);
    }
  }

  // ===== 初始化 =====
  loadHistory();
  loadState();

  // ===== Tab 切换 =====
  tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var tab = btn.getAttribute('data-tab');
      tabGenerate.style.display = (tab === 'generate') ? 'block' : 'none';
      tabHistory.style.display = (tab === 'history') ? 'block' : 'none';
    });
  });

  // ===== Toggle 切换（二维码/条形码）=====
  toggleBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      toggleBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentType = btn.getAttribute('data-type');
      barcodeOptions.classList.toggle('show', currentType === 'barcode');
      autoGenerate();
      saveState();
    });
  });

  // ===== 条形码格式变更 → 自动重新生成 =====
  barcodeFormat.addEventListener('change', function () {
    if (currentType === 'barcode') autoGenerate();
    saveState();
  });

  // ===== 粘贴自动生成 =====
  inputText.addEventListener('paste', function () {
    setTimeout(function() { autoGenerate(); saveState(); }, 50);
  });

  // ===== 输入防抖自动生成（400ms）=====
  inputText.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() { autoGenerate(); saveState(); }, 400);
  });

  // ===== 生成按钮 =====
  generateBtn.addEventListener('click', function() { autoGenerate(); saveState(); });

  // ===== 清空按钮 =====
  clearBtn.addEventListener('click', function () {
    inputText.value = '';
    clearResults();
    inputText.focus();
    saveState();
  });

  // ===== 全部下载 =====
  downloadAllBtn.addEventListener('click', downloadAll);

  // ===== 清空历史 =====
  clearHistoryBtn.addEventListener('click', function () {
    if (historyData.length === 0) return;
    historyData = [];
    saveHistory();
    renderHistory();
  });

  // =============================================
  // 核心：触发生成
  // =============================================
  function autoGenerate() {
    var text = inputText.value.trim();
    if (!text) {
      clearResults();
      return;
    }

    var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
    if (lines.length === 0) {
      clearResults();
      return;
    }

    // 批量上限保护
    if (lines.length > MAX_BATCH) {
      showError('内容超过 ' + MAX_BATCH + ' 行，已截取前 ' + MAX_BATCH + ' 行生成（避免浏览器卡死）');
      lines = lines.slice(0, MAX_BATCH);
    }

    hideError();
    codeGrid.innerHTML = '';
    var failCount = 0;

    lines.forEach(function (line, index) {
      try {
        var item = createCodeItem(line, index);
        codeGrid.appendChild(item);
      } catch (e) {
        failCount++;
      }
    });

    if (codeGrid.children.length === 0 && failCount > 0) {
      showError('所有内容生成失败，请检查输入格式');
      return;
    }

    resultCount.textContent = codeGrid.children.length + ' 个';
    results.classList.add('show');
    emptyState.style.display = 'none';

    if (failCount > 0) {
      showError(failCount + ' 项格式不兼容，已跳过');
    }

    // 保存到历史记录
    addHistory({
      type: currentType,
      format: currentType === 'barcode' ? barcodeFormat.value : null,
      texts: lines
    });
  }

  // =============================================
  // 创建单个码卡片
  // =============================================
  function createCodeItem(text, index) {
    var item = document.createElement('div');
    item.className = 'code-item';

    if (currentType === 'qrcode') {
      var qrDiv = document.createElement('div');
      item.appendChild(qrDiv);
      new QRCode(qrDiv, {
        text: text,
        width: 150,
        height: 150,
        colorDark: '#333333',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      try {
        JsBarcode(svg, text, {
          format: barcodeFormat.value,
          width: 3,
          height: 100,
          displayValue: text.length <= 20,
          fontSize: 16,
          margin: 10
        });
      } catch (e) {
        JsBarcode(svg, text, {
          format: 'CODE128',
          width: 3,
          height: 100,
          displayValue: text.length <= 20,
          fontSize: 16,
          margin: 10
        });
      }
      item.appendChild(svg);
    }

    var label = document.createElement('div');
    label.className = 'code-text';
    label.textContent = text;
    label.title = text;
    item.appendChild(label);

    var dlBtn = document.createElement('button');
    dlBtn.className = 'download-btn';
    dlBtn.textContent = '下载';
    dlBtn.addEventListener('click', function () { downloadSingle(item, text, index); });
    item.appendChild(dlBtn);

    return item;
  }

  // =============================================
  // 历史记录
  // =============================================
  function addHistory(record) {
    var entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      type: record.type,
      format: record.format,
      texts: record.texts,
      timestamp: Date.now()
    };

    // 去重：如果最新一条内容和类型完全相同则跳过
    if (historyData.length > 0) {
      var last = historyData[0];
      if (last.type === entry.type && last.format === entry.format &&
          last.texts.join('\n') === entry.texts.join('\n')) {
        return; // 完全一样，不重复添加
      }
    }

    historyData.unshift(entry);
    if (historyData.length > MAX_HISTORY) {
      historyData = historyData.slice(0, MAX_HISTORY);
    }
    saveHistory();
    renderHistory();
  }

  function loadHistory() {
    if (!hasStorage) { renderHistory(); return; }
    try {
      chrome.storage.local.get(STORAGE_KEY, function (result) {
        try { if (chrome.runtime.lastError) { renderHistory(); return; } } catch (e) { renderHistory(); return; }
        historyData = (result && result[STORAGE_KEY]) || [];
        renderHistory();
      });
    } catch (e) {
      renderHistory();
    }
  }

  function saveHistory() {
    if (!hasStorage) return;
    try {
      var data = {};
      data[STORAGE_KEY] = historyData;
      chrome.storage.local.set(data);
    } catch (e) {
      // storage 不可用时静默忽略
    }
  }

  function renderHistory() {
    // 更新 badge
    if (historyData.length > 0) {
      historyBadge.textContent = historyData.length;
      historyBadge.style.display = 'inline-block';
    } else {
      historyBadge.style.display = 'none';
    }
    historyCount.textContent = historyData.length + ' 条记录';

    // 清空列表
    historyList.innerHTML = '';

    if (historyData.length === 0) {
      historyList.appendChild(historyEmpty);
      return;
    }

    historyData.forEach(function (entry) {
      var item = document.createElement('div');
      item.className = 'history-item';

      // Meta row
      var meta = document.createElement('div');
      meta.className = 'history-item-meta';

      var typeBadge = document.createElement('span');
      typeBadge.className = 'history-type ' + (entry.type === 'qrcode' ? 'qr' : 'bar');
      typeBadge.textContent = entry.type === 'qrcode' ? '二维码' : '条形码' + (entry.format ? ' ' + entry.format : '');
      meta.appendChild(typeBadge);

      var time = document.createElement('span');
      time.className = 'history-time';
      time.textContent = formatTime(entry.timestamp);
      meta.appendChild(time);

      item.appendChild(meta);

      // Texts preview
      var textsDiv = document.createElement('div');
      textsDiv.className = 'history-texts';
      var showCount = Math.min(entry.texts.length, 3);
      for (var i = 0; i < showCount; i++) {
        var line = document.createElement('div');
        line.className = 'text-line';
        line.textContent = entry.texts[i];
        textsDiv.appendChild(line);
      }
      if (entry.texts.length > 3) {
        var more = document.createElement('div');
        more.className = 'more';
        more.textContent = '...还有 ' + (entry.texts.length - 3) + ' 条';
        textsDiv.appendChild(more);
      }
      item.appendChild(textsDiv);

      // Delete button
      var delBtn = document.createElement('button');
      delBtn.className = 'history-delete';
      delBtn.textContent = '×';
      delBtn.title = '删除此记录';
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteHistory(entry.id);
      });
      item.appendChild(delBtn);

      // Click to restore
      item.addEventListener('click', function () {
        restoreHistory(entry);
      });

      historyList.appendChild(item);
    });
  }

  function restoreHistory(entry) {
    // 切换到生成 tab
    tabBtns.forEach(function (b) { b.classList.remove('active'); });
    tabBtns[0].classList.add('active');
    tabGenerate.style.display = 'block';
    tabHistory.style.display = 'none';

    // 恢复类型
    currentType = entry.type;
    toggleBtns.forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-type') === currentType);
    });
    barcodeOptions.classList.toggle('show', currentType === 'barcode');
    if (entry.format) {
      barcodeFormat.value = entry.format;
    }

    // 恢复输入内容并生成
    inputText.value = entry.texts.join('\n');
    autoGenerate();
  }

  function deleteHistory(id) {
    historyData = historyData.filter(function (h) { return h.id !== id; });
    saveHistory();
    renderHistory();
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var now = new Date();
    var diffMs = now - d;
    var diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return diffMin + ' 分钟前';
    if (diffMin < 1440) return Math.floor(diffMin / 60) + ' 小时前';
    if (diffMin < 10080) return Math.floor(diffMin / 1440) + ' 天前';

    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // =============================================
  // 下载单个
  // =============================================
  function downloadSingle(item, text, index) {
    var safeName = sanitizeName(text);
    var suffix = currentType === 'qrcode' ? 'qr' : 'bar';
    var filename = (index + 1) + '_' + safeName + '_' + suffix;

    if (currentType === 'qrcode') {
      var canvas = item.querySelector('canvas');
      var img = item.querySelector('img');
      if (canvas) {
        triggerDownload(canvas.toDataURL('image/png'), filename + '.png');
      } else if (img) {
        triggerDownload(img.src, filename + '.png');
      }
    } else {
      var svg = item.querySelector('svg');
      if (svg) {
        var source = new XMLSerializer().serializeToString(svg);
        var blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
        triggerDownload(URL.createObjectURL(blob), filename + '.svg');
      }
    }
  }

  // =============================================
  // 全部下载
  // =============================================
  function downloadAll() {
    var items = codeGrid.querySelectorAll('.code-item');
    items.forEach(function (item, index) {
      var label = item.querySelector('.code-text');
      var text = label ? label.textContent : 'code_' + (index + 1);
      setTimeout(function () { downloadSingle(item, text, index); }, index * 250);
    });
  }

  // =============================================
  // 工具函数
  // =============================================
  function triggerDownload(url, filename) {
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (url.indexOf('blob:') === 0) {
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
  }

  function sanitizeName(text) {
    return text.replace(/[^a-zA-Z0-9\u4e00-\u9fff\-_.]/g, '_').substring(0, 30) || 'code';
  }

  function clearResults() {
    codeGrid.innerHTML = '';
    results.classList.remove('show');
    emptyState.style.display = '';
    hideError();
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.add('show');
  }

  function hideError() {
    errorMsg.classList.remove('show');
    errorMsg.textContent = '';
  }

  // ===== 钉住开关 =====
  var pinSwitch = document.getElementById('pinSwitch');
  if (pinSwitch) {
    pinSwitch.addEventListener('click', function () {
      try {
        chrome.runtime.sendMessage({ action: 'setPinMode', pinned: false });
      } catch (e) {
        console.warn('扩展已失效，请刷新页面');
      }
    });
  }
})();
