(function(global) {
  'use strict';

  const CONFIG = {
    WIDGET_ID: 'feedback-widget',
    DEFAULT_ENDPOINT: 'https://your-backend.com/api/feedback', // I am replacing the actual with dummy API
    MIN_MESSAGE_LENGTH: 5,
    MAX_MESSAGE_LENGTH: 1000,
    THROTTLE_DELAY: 3000,
    REQUEST_TIMEOUT: 10000,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
    ANIMATION_DURATION: 300,
    Z_INDEX: 100000
  };

  // State management
  const state = {
    isOpen: false,
    isSubmitting: false,
    config: {},
    retryCount: 0
  };

  // Utility functions
  const utils = {
    debounce(fn, delay) {
      let timeoutId;
      return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    throttle(fn, delay) {
      let lastCall = 0;
      let timeoutId;
      return (...args) => {
        const now = Date.now();
        const timeSinceLastCall = now - lastCall;
        
        clearTimeout(timeoutId);
        
        if (timeSinceLastCall >= delay) {
          lastCall = now;
          fn.apply(this, args);
        } else {
          timeoutId = setTimeout(() => {
            lastCall = Date.now();
            fn.apply(this, args);
          }, delay - timeSinceLastCall);
        }
      };
    },

    sanitizeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    validateMessage(message) {
      if (typeof message !== 'string') return false;
      const trimmed = message.trim();
      return trimmed.length >= CONFIG.MIN_MESSAGE_LENGTH && 
             trimmed.length <= CONFIG.MAX_MESSAGE_LENGTH;
    },

    createTimeout(promise, timeout) {
      return Promise.race([
        promise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
      ]);
    },

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  };

  const getStyles = () => `
    :host {
      --primary-color: #4f46e5;
      --primary-hover: #3730a3;
      --success-color: #10b981;
      --error-color: #ef4444;
      --text-color: #1f2937;
      --border-color: #e5e7eb;
      --shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 6px 10px rgba(0, 0, 0, 0.05);
      --radius: 12px;
      --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .widget-container {
      font-family: var(--font-family);
      background: #ffffff;
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
      width: 100%;
      max-width: 380px;
      transform: translateY(0);
      transition: all ${CONFIG.ANIMATION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(10px);
    }

    .widget-container.widget-hidden {
      transform: translateY(100%);
      opacity: 0;
    }

    .widget-header {
      background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
      color: white;
      padding: 16px 20px;
      font-size: 16px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
      transition: background-color 0.2s ease;
      position: relative;
      overflow: hidden;
    }

    .widget-header::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
      transition: left 0.5s ease;
    }

    .widget-header:hover::before {
      left: 100%;
    }

    .widget-header:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.5);
      outline-offset: -2px;
    }

    .header-icon {
      font-size: 12px;
      transition: transform ${CONFIG.ANIMATION_DURATION}ms ease;
      display: inline-block;
    }

    .header-icon.rotated {
      transform: rotate(90deg);
    }

    .widget-form {
      padding: 20px;
      display: none;
      animation: slideDown ${CONFIG.ANIMATION_DURATION}ms ease-out;
    }

    .widget-form.show {
      display: block;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-color);
    }

    .form-textarea {
      width: 100%;
      min-height: 100px;
      max-height: 200px;
      border: 2px solid var(--border-color);
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
      font-family: inherit;
      resize: vertical;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      background: #fafafa;
    }

    .form-textarea:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
      background: white;
    }

    .form-textarea.error {
      border-color: var(--error-color);
      background: #fef2f2;
    }

    .char-counter {
      font-size: 12px;
      color: #6b7280;
      text-align: right;
      margin-top: 4px;
    }

    .char-counter.warning {
      color: #f59e0b;
    }

    .char-counter.error {
      color: var(--error-color);
    }

    .form-button {
      background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
      color: white;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
      min-width: 120px;
    }

    .form-button:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(79, 70, 229, 0.3);
    }

    .form-button:active:not(:disabled) {
      transform: translateY(0);
    }

    .form-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .loading-spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 1s linear infinite;
      margin-right: 8px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .message {
      padding: 16px 20px;
      font-size: 14px;
      line-height: 1.5;
      display: none;
      animation: fadeIn 0.3s ease-out;
    }

    .message.show {
      display: block;
    }

    .message-success {
      background: #f0fdf4;
      color: var(--success-color);
      border-top: 1px solid #dcfce7;
    }

    .message-error {
      background: #fef2f2;
      color: var(--error-color);
      border-top: 1px solid #fecaca;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .close-button {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.8);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      transition: color 0.2s ease;
    }

    .close-button:hover {
      color: white;
      background: rgba(255, 255, 255, 0.1);
    }

    @media (max-width: 480px) {
      .widget-container {
        max-width: calc(100vw - 40px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  `;

  const getTemplate = () => `
    <div class="widget-container" role="dialog" aria-labelledby="widget-title" aria-hidden="true">
      <div class="widget-header" role="button" tabindex="0" aria-expanded="false">
        <span id="widget-title">Feedback</span>
        <div class="header-controls">
          <span class="header-icon" aria-hidden="true">▶</span>
        </div>
      </div>
      <div class="widget-form" aria-hidden="true">
        <div class="form-group">
          <label class="form-label" for="feedback-textarea">Share your thoughts</label>
          <textarea 
            id="feedback-textarea"
            class="form-textarea" 
            placeholder="What's on your mind? We'd love to hear your feedback..."
            aria-describedby="char-counter feedback-error"
            maxlength="${CONFIG.MAX_MESSAGE_LENGTH}"
          ></textarea>
          <div id="char-counter" class="char-counter">
            0 / ${CONFIG.MAX_MESSAGE_LENGTH}
          </div>
        </div>
        <button type="button" class="form-button">
          <span class="button-text">Send Feedback</span>
        </button>
      </div>
      <div id="success-message" class="message message-success" role="status" aria-live="polite">
        <strong>Thank you!</strong> Your feedback has been received.
      </div>
      <div id="error-message" class="message message-error" role="alert" aria-live="assertive">
        <span class="error-text">Something went wrong. Please try again.</span>
      </div>
    </div>
  `;

  class FeedbackWidget {
    constructor(config = {}) {
      this.config = { ...CONFIG, ...config };
      this.state = { ...state };
      this.elements = {};
      this.abortController = null;
      
      this.init();
    }

    init() {
      if (this.isAlreadyInitialized()) return;
      
      this.createWidget();
      this.bindEvents();
      this.setupAccessibility();
      
      if (this.config.defaultOpen) {
        setTimeout(() => this.toggle(), 100);
      }
    }

    isAlreadyInitialized() {
      return document.getElementById(this.config.WIDGET_ID) !== null;
    }

    createWidget() {
      const host = document.createElement('div');
      host.id = this.config.WIDGET_ID;
      this.applyHostStyles(host);

      const shadow = host.attachShadow({ mode: 'open' });
      
      const style = document.createElement('style');
      style.textContent = getStyles();
      shadow.appendChild(style);

      const wrapper = document.createElement('div');
      wrapper.innerHTML = getTemplate();
      shadow.appendChild(wrapper.firstElementChild);
      
      this.cacheElements(shadow);
      
      document.body.appendChild(host);
      this.host = host;
    }

    applyHostStyles(host) {
      Object.assign(host.style, {
        position: 'fixed',
        bottom: '20px',
        right: this.config.position === 'left' ? 'auto' : '20px',
        left: this.config.position === 'left' ? '20px' : 'auto',
        zIndex: this.config.Z_INDEX.toString(),
        width: '340px',
        height: 'auto',
        pointerEvents: 'auto'
      });
    }

    cacheElements(shadow) {
      this.elements = {
        container: shadow.querySelector('.widget-container'),
        header: shadow.querySelector('.widget-header'),
        form: shadow.querySelector('.widget-form'),
        textarea: shadow.querySelector('.form-textarea'),
        button: shadow.querySelector('.form-button'),
        buttonText: shadow.querySelector('.button-text'),
        success: shadow.querySelector('#success-message'),
        error: shadow.querySelector('#error-message'),
        errorText: shadow.querySelector('.error-text'),
        charCounter: shadow.querySelector('#char-counter'),
        headerIcon: shadow.querySelector('.header-icon')
      };
    }

    bindEvents() {
      this.elements.header.addEventListener('click', () => this.toggle());
      this.elements.header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.toggle();
        }
      });

      // Form submission
      this.elements.button.addEventListener('click', () => this.handleSubmit());
      
      // Textarea events
      this.elements.textarea.addEventListener('input', 
        utils.debounce(() => this.updateCharCounter(), 100)
      );
      
      this.elements.textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.handleSubmit();
        }
      });

      // Global escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.state.isOpen) {
          this.close();
        }
      });
    }

    setupAccessibility() {
      this.elements.container.setAttribute('aria-hidden', 'true');
    }

    toggle() {
      this.state.isOpen ? this.close() : this.open();
    }

    open() {
      this.state.isOpen = true;
      this.elements.form.classList.add('show');
      this.elements.form.style.display = 'block';
      this.elements.headerIcon.classList.add('rotated');
      this.elements.header.setAttribute('aria-expanded', 'true');
      this.elements.container.setAttribute('aria-hidden', 'false');
      this.elements.form.setAttribute('aria-hidden', 'false');
      
      this.hideMessages();
      setTimeout(() => this.elements.textarea.focus(), CONFIG.ANIMATION_DURATION);
    }

    close() {
      this.state.isOpen = false;
      this.elements.form.classList.remove('show');
      setTimeout(() => {
        this.elements.form.style.display = 'none';
      }, CONFIG.ANIMATION_DURATION);
      
      this.elements.headerIcon.classList.remove('rotated');
      this.elements.header.setAttribute('aria-expanded', 'false');
      this.elements.container.setAttribute('aria-hidden', 'true');
      this.elements.form.setAttribute('aria-hidden', 'true');
    }

    updateCharCounter() {
      const length = this.elements.textarea.value.length;
      const remaining = CONFIG.MAX_MESSAGE_LENGTH - length;
      
      this.elements.charCounter.textContent = `${length} / ${CONFIG.MAX_MESSAGE_LENGTH}`;
      
      this.elements.charCounter.className = 'char-counter';
      if (remaining < 50) {
        this.elements.charCounter.classList.add(remaining < 0 ? 'error' : 'warning');
      }
    }

    async handleSubmit() {
      if (this.state.isSubmitting) return;

      const message = this.elements.textarea.value.trim();
      
      if (!this.validateInput(message)) return;

      await this.submitWithRetry(message);
    }

    validateInput(message) {
      this.elements.textarea.classList.remove('error');
      
      if (!utils.validateMessage(message)) {
        this.showError(`Please enter between ${CONFIG.MIN_MESSAGE_LENGTH} and ${CONFIG.MAX_MESSAGE_LENGTH} characters.`);
        this.elements.textarea.classList.add('error');
        this.elements.textarea.focus();
        return false;
      }
      
      return true;
    }

    async submitWithRetry(message, attempt = 1) {
      try {
        this.setSubmittingState(true);
        await this.submitFeedback(message);
        this.handleSubmitSuccess();
      } catch (error) {
        console.error('[Feedback Widget] Submission error:', error);
        
        if (attempt < CONFIG.RETRY_ATTEMPTS) {
          await utils.sleep(CONFIG.RETRY_DELAY * attempt);
          return this.submitWithRetry(message, attempt + 1);
        }
        
        this.handleSubmitError(error);
      } finally {
        this.setSubmittingState(false);
      }
    }

    async submitFeedback(message) {
      this.abortController = new AbortController();
      
      const payload = {
        message: utils.sanitizeHTML(message),
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        ...this.config.extraData
      };

      const request = fetch(this.config.endpoint || CONFIG.DEFAULT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers
        },
        body: JSON.stringify(payload),
        signal: this.abortController.signal
      });

      const response = await utils.createTimeout(request, CONFIG.REQUEST_TIMEOUT);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return response.json().catch(() => ({}));
    }

    setSubmittingState(isSubmitting) {
      this.state.isSubmitting = isSubmitting;
      this.elements.button.disabled = isSubmitting;
      
      if (isSubmitting) {
        this.elements.buttonText.innerHTML = '<span class="loading-spinner"></span>Sending...';
      } else {
        this.elements.buttonText.textContent = 'Send Feedback';
      }
    }

    handleSubmitSuccess() {
      this.elements.textarea.value = '';
      this.updateCharCounter();
      this.showSuccess();
      
      if (this.config.onSuccess) {
        this.config.onSuccess();
      }
    }

    handleSubmitError(error) {
      const message = error.name === 'AbortError' 
        ? 'Request was cancelled.'
        : 'Failed to send feedback. Please try again.';
      
      this.showError(message);
      
      if (this.config.onError) {
        this.config.onError(error);
      }
    }

    showSuccess() {
      this.hideMessages();
      this.elements.success.classList.add('show');
      this.elements.success.style.display = 'block';
    }

    showError(message) {
      this.hideMessages();
      this.elements.errorText.textContent = message;
      this.elements.error.classList.add('show');
      this.elements.error.style.display = 'block';
    }

    hideMessages() {
      [this.elements.success, this.elements.error].forEach(el => {
        el.classList.remove('show');
        setTimeout(() => el.style.display = 'none', CONFIG.ANIMATION_DURATION);
      });
    }

    destroy() {
      if (this.abortController) {
        this.abortController.abort();
      }
      
      if (this.host && this.host.parentNode) {
        this.host.parentNode.removeChild(this.host);
      }
    }
  }

  global.FeedbackWidget = {
    init(config = {}) {
      return new FeedbackWidget(config);
    },
    
    exists() {
      return document.getElementById(CONFIG.WIDGET_ID) !== null;
    }
  };

  if (typeof global.FeedbackWidgetConfig === 'undefined') {
    setTimeout(() => {
      if (!FeedbackWidget.exists()) {
        new FeedbackWidget();
      }
    }, 100);
  }

})(window);
