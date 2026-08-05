const config = window.AI_WEB_CONFIG || {};
const workerUrl = String(config.WORKER_URL || '').replace(/\/$/, '');
const sessionKey = 'zashugannyy-ai-web-session';
const modelKey = 'zashugannyy-ai-web-model';

const authScreen = document.querySelector('#auth-screen');
const app = document.querySelector('#app');
const loginForm = document.querySelector('#login-form');
const loginCode = document.querySelector('#login-code');
const authStatus = document.querySelector('#auth-status');
const messages = document.querySelector('#messages');
const welcomeState = document.querySelector('#welcome-state');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const modelButtons = document.querySelectorAll('.model-option');
const promptButtons = document.querySelectorAll('.prompt-grid button');
const sidebar = document.querySelector('#sidebar');
const mobileMenu = document.querySelector('.mobile-menu');
const accountButton = document.querySelector('#account-button');
const accountMenu = document.querySelector('#account-menu');
const logoutButton = document.querySelector('#logout-button');
const newChatButton = document.querySelector('#new-chat-button');
const clearChatButton = document.querySelector('#clear-chat');
const toast = document.querySelector('#toast');

let sessionToken = localStorage.getItem(sessionKey) || '';
let selectedModel = localStorage.getItem(modelKey) || 'low';
let profile = null;
let chatHistory = [];
let isSending = false;

const modelInfo = {
  low: { title: 'LOW', description: 'Быстрый режим', symbol: '⚡' },
  medium: { title: 'MEDIUM', description: 'Универсальный режим', symbol: '✦' },
  high: { title: 'HIGH', description: 'Продвинутый режим', symbol: '◆' },
};

const workerIsConfigured = () => workerUrl.startsWith('https://') && !workerUrl.includes('YOUR-NEW-WORKER');

const api = async (path, options = {}) => {
  if (!workerIsConfigured()) throw new Error('Сначала укажите адрес Worker в config.js.');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  const response = await fetch(`${workerUrl}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Не удалось выполнить запрос.');
    error.status = response.status;
    throw error;
  }
  return data;
};

const showToast = (text) => {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3200);
};

const setAuthenticated = (authenticated) => {
  authScreen.hidden = authenticated;
  app.hidden = !authenticated;
  document.body.style.overflow = authenticated ? 'hidden' : 'hidden';
};

const formatPlanDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

const updateProfileUi = (data) => {
  profile = data;
  const user = data.user;
  const usage = data.usage;
  const plan = String(user.plan || 'free').toUpperCase();
  const unlimited = usage.limit === null;
  const remaining = unlimited ? '∞' : Math.max(Number(usage.remaining || 0), 0);
  const used = Number(usage.used || 0);
  const percent = unlimited ? 7 : Math.min((used / Math.max(Number(usage.limit || 1), 1)) * 100, 100);
  const displayName = user.display_name || 'Пользователь';

  document.querySelector('#header-plan').textContent = plan;
  document.querySelector('#header-usage').textContent = unlimited ? 'БЕЗЛИМИТ' : `${used} / ${usage.limit}`;
  document.querySelector('#plan-badge').textContent = plan;
  document.querySelector('#remaining-count').textContent = remaining;
  document.querySelector('#remaining-label').textContent = unlimited ? 'безлимит запросов' : 'запросов осталось';
  document.querySelector('#usage-progress').style.width = `${percent}%`;
  document.querySelector('#reset-label').textContent = usage.reset_label || 'Лимит обновится автоматически';
  document.querySelector('#composer-remaining').textContent = unlimited ? 'безлимит' : `${remaining} запросов`;
  document.querySelector('#account-name').textContent = displayName;
  document.querySelector('#account-id').textContent = `Telegram ID: ${user.telegram_id}`;
  document.querySelector('#account-button').textContent = displayName.slice(0, 2).toUpperCase();
  document.querySelector('#account-name').title = user.plan_expires_at ? `Подписка до ${formatPlanDate(user.plan_expires_at)}` : 'Тариф Free';
};

const selectModel = (model) => {
  if (!modelInfo[model]) return;
  selectedModel = model;
  localStorage.setItem(modelKey, model);
  modelButtons.forEach((button) => {
    const active = button.dataset.model === model;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  document.querySelector('#active-model-title').textContent = modelInfo[model].title;
  document.querySelector('#active-model-description').textContent = modelInfo[model].description;
  document.querySelector('#composer-model').textContent = modelInfo[model].title;
};

const addMessage = (role, text, loading = false) => {
  welcomeState.hidden = true;
  const row = document.createElement('article');
  row.className = `message-row ${role}${loading ? ' loading' : ''}`;
  const avatar = document.createElement('span');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'assistant' ? 'AI' : 'YOU';
  const content = document.createElement('div');
  content.className = 'message-content';
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  const name = document.createElement('b');
  name.textContent = role === 'assistant' ? 'zashugannyy kot | Ai' : 'Вы';
  const detail = document.createElement('span');
  detail.textContent = role === 'assistant' ? modelInfo[selectedModel].title : 'сейчас';
  const body = document.createElement('div');
  body.className = 'message-text';
  body.textContent = text;
  meta.append(name, detail);
  content.append(meta, body);
  row.append(avatar, content);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
  return row;
};

const resetChat = () => {
  chatHistory = [];
  messages.querySelectorAll('.message-row').forEach((item) => item.remove());
  welcomeState.hidden = false;
  document.querySelector('#chat-title').textContent = 'Новый диалог';
  chatInput.value = '';
  chatInput.focus();
};

const sendMessage = async (text) => {
  if (isSending || !text.trim()) return;
  const clean = text.trim();
  isSending = true;
  chatForm.querySelector('button').disabled = true;
  addMessage('user', clean);
  if (!chatHistory.length) {
    document.querySelector('#chat-title').textContent = clean.slice(0, 34) + (clean.length > 34 ? '…' : '');
  }
  chatHistory.push({ role: 'user', content: clean });
  const loading = addMessage('assistant', 'Думаю', true);

  try {
    const data = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ model: selectedModel, messages: chatHistory.slice(-10) }),
    });
    loading.remove();
    addMessage('assistant', data.answer);
    chatHistory.push({ role: 'assistant', content: data.answer });
    updateProfileUi({ user: profile.user, usage: data.usage });
  } catch (error) {
    loading.remove();
    addMessage('assistant', error.message);
    chatHistory.pop();
    if (error.status === 401) await logout(false);
  } finally {
    isSending = false;
    chatForm.querySelector('button').disabled = false;
    chatInput.focus();
  }
};

const logout = async (notifyWorker = true) => {
  if (notifyWorker && sessionToken) {
    try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
  }
  sessionToken = '';
  profile = null;
  localStorage.removeItem(sessionKey);
  setAuthenticated(false);
  accountMenu.hidden = true;
  resetChat();
};

loginCode?.addEventListener('input', () => {
  const clean = loginCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
  loginCode.value = clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
});

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  authStatus.textContent = '';
  const submit = loginForm.querySelector('button');
  submit.disabled = true;
  try {
    const data = await api('/api/auth/exchange', {
      method: 'POST',
      body: JSON.stringify({ code: loginCode.value }),
    });
    sessionToken = data.token;
    localStorage.setItem(sessionKey, sessionToken);
    updateProfileUi({ user: data.user, usage: data.usage });
    setAuthenticated(true);
    selectModel(selectedModel);
    loginCode.value = '';
  } catch (error) {
    authStatus.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

chatForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = chatInput.value;
  if (!value.trim()) return;
  chatInput.value = '';
  chatInput.style.height = '';
  sendMessage(value);
});

chatInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

chatInput?.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 150)}px`;
});

modelButtons.forEach((button) => button.addEventListener('click', () => selectModel(button.dataset.model)));
promptButtons.forEach((button) => button.addEventListener('click', () => {
  chatInput.value = button.querySelector('b').textContent + ': ';
  chatInput.focus();
}));
newChatButton?.addEventListener('click', () => { resetChat(); sidebar.classList.remove('open'); });
clearChatButton?.addEventListener('click', resetChat);
mobileMenu?.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  mobileMenu.setAttribute('aria-expanded', String(open));
});
accountButton?.addEventListener('click', () => { accountMenu.hidden = !accountMenu.hidden; });
logoutButton?.addEventListener('click', () => logout(true));
document.addEventListener('click', (event) => {
  if (!accountMenu.hidden && !event.target.closest('.header-account')) accountMenu.hidden = true;
});

const initialize = async () => {
  selectModel(selectedModel);
  if (!sessionToken) {
    setAuthenticated(false);
    if (!workerIsConfigured()) authStatus.textContent = 'После создания Worker укажите его адрес в config.js.';
    return;
  }
  try {
    const data = await api('/api/me');
    updateProfileUi(data);
    setAuthenticated(true);
  } catch {
    await logout(false);
  }
};

initialize();
