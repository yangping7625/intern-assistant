/**
 * API Key 管理器（与 ai-eval-lab 共用同一套逻辑）
 * 用户自行输入 DeepSeek API Key，保存在 localStorage
 */
const APIKeyManager = {
  storageKey: 'deepseek_api_key',

  get() {
    return localStorage.getItem(this.storageKey) || '';
  },

  set(key) {
    localStorage.setItem(this.storageKey, key.trim());
  },

  isReady() {
    const key = this.get();
    return key && key.length > 10;
  },

  prompt() {
    const modal = document.getElementById('api-key-modal');
    if (modal) {
      const input = document.getElementById('api-key-input');
      input.value = this.get();
      modal.style.display = 'flex';
      input.focus();
    }
  },

  close() {
    const modal = document.getElementById('api-key-modal');
    if (modal) modal.style.display = 'none';
  },

  saveAndClose() {
    const input = document.getElementById('api-key-input');
    if (input && input.value.trim().length > 10) {
      this.set(input.value);
      this.close();
      const indicator = document.getElementById('api-key-status');
      if (indicator) {
        indicator.textContent = '✓ Key 已配置';
        indicator.className = 'api-key-status ready';
      }
      return true;
    }
    return false;
  },

  init() {
    const indicator = document.getElementById('api-key-status');
    if (this.isReady()) {
      if (indicator) {
        indicator.textContent = '✓ Key 已配置';
        indicator.className = 'api-key-status ready';
      }
    } else {
      if (indicator) {
        indicator.textContent = '⚠️ 未配置 Key';
        indicator.className = 'api-key-status not-ready';
      }
      setTimeout(() => this.prompt(), 500);
    }
  }
};
