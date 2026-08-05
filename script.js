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
const conversationListElement = document.querySelector('#conversation-list');
const syncStatus = document.querySelector('#sync-status');
const toast = document.querySelector('#toast');
const personalizationButton = document.querySelector('#personalization-button');
const accountPersonalizationButton = document.querySelector('#account-personalization-button');
const personalizationModal = document.querySelector('#personalization-modal');
const personalizationForm = document.querySelector('#personalization-form');
const personalizationClose = document.querySelector('#personalization-close');
const personalizationCancel = document.querySelector('#personalization-cancel');
const personalizationBackdrop = document.querySelector('.personalization-backdrop');
const preferredNameInput = document.querySelector('#preferred-name');
const personalizationAbout = document.querySelector('#personalization-about');
const aboutCounter = document.querySelector('#about-counter');
const personalizationStatus = document.querySelector('#personalization-status');

let sessionToken = localStorage.getItem(sessionKey) || '';
let selectedModel = localStorage.getItem(modelKey) || 'low';
let profile = null;
let conversations = [];
let activeConversationId = null;
let activeConversationUpdatedAt = '';
let isSending = false;
let syncTimer = null;

const modelInfo = {
  low: { title: 'LOW', description: 'Быстрый режим' },
  medium: { title: 'MEDIUM', description: 'Универсальный режим' },
  high: { title: 'HIGH', description: 'Продвинутый режим' },
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
    error.data = data;
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
  document.body.style.overflow = 'hidden';
};

const formatPlanDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

const updateProfileUi = (data) => {
  profile = data;
  const { user, usage } = data;
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

const updateAboutCounter = () => {
  aboutCounter.textContent = String(personalizationAbout.value.length);
};

const closePersonalization = () => {
  personalizationModal.hidden = true;
  document.body.classList.remove('modal-open');
  personalizationStatus.textContent = '';
};

const openPersonalization = async () => {
  accountMenu.hidden = true;
  personalizationModal.hidden = false;
  document.body.classList.add('modal-open');
  personalizationStatus.textContent = 'Загружаю настройки…';
  personalizationForm.querySelector('button[type="submit"]').disabled = true;
  try {
    const data = await api('/api/personalization');
    const settings = data.personalization;
    preferredNameInput.value = settings.preferred_name || '';
    personalizationAbout.value = settings.about || '';
    const style = personalizationForm.querySelector(`input[name="response_style"][value="${settings.response_style}"]`)
      || personalizationForm.querySelector('input[name="response_style"][value="balanced"]');
    style.checked = true;
    updateAboutCounter();
    personalizationStatus.textContent = 'Настройки синхронизированы с аккаунтом';
    preferredNameInput.focus();
  } catch (error) {
    personalizationStatus.textContent = error.message;
  } finally {
    personalizationForm.querySelector('button[type="submit"]').disabled = false;
  }
};

const savePersonalization = async (event) => {
  event.preventDefault();
  const submit = personalizationForm.querySelector('button[type="submit"]');
  const selectedStyle = personalizationForm.querySelector('input[name="response_style"]:checked');
  submit.disabled = true;
  personalizationStatus.textContent = 'Сохраняю…';
  try {
    await api('/api/personalization', {
      method: 'POST',
      body: JSON.stringify({
        preferred_name: preferredNameInput.value,
        about: personalizationAbout.value,
        response_style: selectedStyle?.value || 'balanced',
      }),
    });
    personalizationStatus.textContent = 'Сохранено на всех устройствах';
    showToast('Персонализация сохранена');
    setTimeout(closePersonalization, 650);
  } catch (error) {
    personalizationStatus.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
};

const applyModelUi = (model) => {
  if (!modelInfo[model]) model = 'low';
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

const selectModel = async (model, persist = true) => {
  if (!modelInfo[model]) return;
  applyModelUi(model);
  const conversation = conversations.find((item) => item.id === activeConversationId);
  if (!conversation) return;
  conversation.model = model;
  renderConversationList();
  if (!persist) return;
  try {
    const data = await api(`/api/conversations/${conversation.id}/model`, {
      method: 'POST', body: JSON.stringify({ model }),
    });
    conversation.updated_at = data.updated_at;
    activeConversationUpdatedAt = data.updated_at;
  } catch (error) {
    showToast(error.message);
  }
};

const addMessage = (role, text, options = {}) => {
  welcomeState.hidden = true;
  const row = document.createElement('article');
  row.className = `message-row ${role}${options.loading ? ' loading' : ''}`;
  if (options.id) row.dataset.messageId = String(options.id);
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
  const messageModel = options.model && modelInfo[options.model] ? options.model : selectedModel;
  detail.textContent = role === 'assistant' ? modelInfo[messageModel].title : 'сейчас';
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

const renderMessages = (items) => {
  messages.querySelectorAll('.message-row').forEach((item) => item.remove());
  welcomeState.hidden = items.length > 0;
  items.forEach((item) => addMessage(item.role, item.content, { id: item.id, model: item.model_tier }));
  messages.scrollTop = messages.scrollHeight;
};

const conversationSubtitle = (conversation) => {
  const count = Number(conversation.message_count || 0);
  if (!count) return 'Пустой диалог';
  return `${count} сообщ. · ${modelInfo[conversation.model]?.title || 'LOW'}`;
};

const renderConversationList = () => {
  conversationListElement.replaceChildren();
  conversations.forEach((conversation) => {
    const row = document.createElement('div');
    row.className = `conversation-item${conversation.id === activeConversationId ? ' active' : ''}`;
    row.dataset.id = conversation.id;
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'conversation-open';
    const mark = document.createElement('span');
    mark.textContent = '◌';
    const text = document.createElement('p');
    const title = document.createElement('b');
    title.textContent = conversation.title;
    const subtitle = document.createElement('small');
    subtitle.textContent = conversationSubtitle(conversation);
    text.append(title, subtitle);
    open.append(mark, text);
    open.addEventListener('click', () => openConversation(conversation.id));
    const actions = document.createElement('div');
    actions.className = 'conversation-actions';
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.title = 'Переименовать';
    rename.setAttribute('aria-label', 'Переименовать диалог');
    rename.textContent = '✎';
    rename.addEventListener('click', () => renameConversation(conversation));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.title = 'Удалить';
    remove.setAttribute('aria-label', 'Удалить диалог');
    remove.textContent = '×';
    remove.addEventListener('click', () => deleteConversation(conversation));
    actions.append(rename, remove);
    row.append(open, actions);
    conversationListElement.append(row);
  });
};

const updateConversation = (updated) => {
  const index = conversations.findIndex((item) => item.id === updated.id);
  if (index >= 0) conversations[index] = { ...conversations[index], ...updated };
  else conversations.unshift(updated);
  conversations.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  if (updated.id === activeConversationId) activeConversationUpdatedAt = updated.updated_at;
  renderConversationList();
};

const createConversation = async () => {
  const data = await api('/api/conversations/create', {
    method: 'POST', body: JSON.stringify({ title: 'Новый диалог', model: selectedModel }),
  });
  conversations.unshift(data.conversation);
  await openConversation(data.conversation.id);
  sidebar.classList.remove('open');
  return data.conversation;
};

const openConversation = async (conversationId, closeMobile = true) => {
  const conversation = conversations.find((item) => item.id === conversationId);
  if (!conversation) return;
  activeConversationId = conversationId;
  activeConversationUpdatedAt = conversation.updated_at;
  applyModelUi(conversation.model || 'low');
  renderConversationList();
  syncStatus.textContent = 'загрузка…';
  try {
    const data = await api(`/api/conversations/${conversationId}/messages`);
    if (activeConversationId !== conversationId) return;
    renderMessages(data.messages || []);
    activeConversationUpdatedAt = data.conversation.updated_at;
    syncStatus.textContent = 'синхронизировано';
  } catch (error) {
    showToast(error.message);
    syncStatus.textContent = 'ошибка';
  }
  if (closeMobile) sidebar.classList.remove('open');
  chatInput.focus();
};

const loadConversations = async () => {
  const data = await api('/api/conversations');
  conversations = data.conversations || [];
  if (!conversations.length) {
    await createConversation();
    return;
  }
  const preferred = conversations.some((item) => item.id === activeConversationId)
    ? activeConversationId
    : conversations[0].id;
  await openConversation(preferred, false);
};

const renameConversation = async (conversation) => {
  const title = window.prompt('Новое название диалога', conversation.title);
  if (title === null || !title.trim()) return;
  try {
    const data = await api(`/api/conversations/${conversation.id}/rename`, {
      method: 'POST', body: JSON.stringify({ title }),
    });
    updateConversation({ ...conversation, title: data.title, updated_at: data.updated_at });
  } catch (error) {
    showToast(error.message);
  }
};

const deleteConversation = async (conversation) => {
  if (!window.confirm(`Удалить диалог «${conversation.title}» на всех устройствах?`)) return;
  try {
    await api(`/api/conversations/${conversation.id}/delete`, { method: 'POST', body: '{}' });
    conversations = conversations.filter((item) => item.id !== conversation.id);
    if (activeConversationId === conversation.id) {
      activeConversationId = null;
      if (conversations.length) await openConversation(conversations[0].id);
      else await createConversation();
    } else renderConversationList();
  } catch (error) {
    showToast(error.message);
  }
};

const clearActiveConversation = async () => {
  const conversation = conversations.find((item) => item.id === activeConversationId);
  if (!conversation || !window.confirm('Очистить сообщения этого диалога на всех устройствах?')) return;
  try {
    const data = await api(`/api/conversations/${conversation.id}/clear`, { method: 'POST', body: '{}' });
    conversation.title = data.title;
    conversation.updated_at = data.updated_at;
    conversation.message_count = 0;
    conversation.preview = '';
    activeConversationUpdatedAt = data.updated_at;
    renderMessages([]);
    updateConversation(conversation);
    chatInput.focus();
  } catch (error) {
    showToast(error.message);
  }
};

const sendMessage = async (text) => {
  if (isSending || !text.trim()) return;
  if (!activeConversationId) await createConversation();
  const clean = text.trim();
  isSending = true;
  chatForm.querySelector('button').disabled = true;
  const optimisticUser = addMessage('user', clean);
  const loading = addMessage('assistant', 'Думаю', { loading: true, model: selectedModel });

  try {
    const data = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: activeConversationId, model: selectedModel, message: clean }),
    });
    loading.remove();
    optimisticUser.dataset.saved = 'true';
    addMessage('assistant', data.answer, { model: selectedModel });
    updateProfileUi({ user: profile.user, usage: data.usage });
    updateConversation(data.conversation);
    syncStatus.textContent = 'синхронизировано';
  } catch (error) {
    loading.remove();
    optimisticUser.remove();
    addMessage('assistant', error.message, { model: selectedModel });
    if (error.data?.usage && profile) updateProfileUi({ user: profile.user, usage: error.data.usage });
    if (error.status === 401) await logout(false);
  } finally {
    isSending = false;
    chatForm.querySelector('button').disabled = false;
    chatInput.focus();
  }
};

const syncFromServer = async () => {
  if (!sessionToken || isSending || document.hidden) return;
  try {
    const data = await api('/api/conversations');
    const remote = data.conversations || [];
    const remoteActive = remote.find((item) => item.id === activeConversationId);
    conversations = remote;
    if (!remote.length) {
      await createConversation();
      return;
    }
    if (!remoteActive) {
      await openConversation(remote[0].id, false);
      return;
    }
    renderConversationList();
    if (remoteActive.updated_at !== activeConversationUpdatedAt) {
      await openConversation(remoteActive.id, false);
    } else {
      syncStatus.textContent = 'синхронизировано';
    }
  } catch {
    syncStatus.textContent = 'нет связи';
  }
};

const startSync = () => {
  clearInterval(syncTimer);
  syncTimer = setInterval(syncFromServer, 5000);
};

const logout = async (notifyWorker = true) => {
  clearInterval(syncTimer);
  personalizationModal.hidden = true;
  document.body.classList.remove('modal-open');
  if (notifyWorker && sessionToken) {
    try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
  }
  sessionToken = '';
  profile = null;
  conversations = [];
  activeConversationId = null;
  activeConversationUpdatedAt = '';
  localStorage.removeItem(sessionKey);
  conversationListElement.replaceChildren();
  renderMessages([]);
  setAuthenticated(false);
  accountMenu.hidden = true;
};

const bootstrapApp = async () => {
  await loadConversations();
  startSync();
  syncStatus.textContent = 'синхронизировано';
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
      method: 'POST', body: JSON.stringify({ code: loginCode.value }),
    });
    sessionToken = data.token;
    localStorage.setItem(sessionKey, sessionToken);
    updateProfileUi({ user: data.user, usage: data.usage });
    setAuthenticated(true);
    loginCode.value = '';
    await bootstrapApp();
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
  chatInput.value = `${button.querySelector('b').textContent}: `;
  chatInput.focus();
}));
newChatButton?.addEventListener('click', async () => {
  try { await createConversation(); } catch (error) { showToast(error.message); }
});
clearChatButton?.addEventListener('click', clearActiveConversation);
mobileMenu?.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  mobileMenu.setAttribute('aria-expanded', String(open));
});
accountButton?.addEventListener('click', () => { accountMenu.hidden = !accountMenu.hidden; });
logoutButton?.addEventListener('click', () => logout(true));
personalizationButton?.addEventListener('click', openPersonalization);
accountPersonalizationButton?.addEventListener('click', openPersonalization);
personalizationForm?.addEventListener('submit', savePersonalization);
personalizationClose?.addEventListener('click', closePersonalization);
personalizationCancel?.addEventListener('click', closePersonalization);
personalizationBackdrop?.addEventListener('click', closePersonalization);
personalizationAbout?.addEventListener('input', updateAboutCounter);
document.addEventListener('click', (event) => {
  if (!accountMenu.hidden && !event.target.closest('.header-account')) accountMenu.hidden = true;
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !personalizationModal.hidden) closePersonalization();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncFromServer();
});

const initialize = async () => {
  applyModelUi(selectedModel);
  if (!sessionToken) {
    setAuthenticated(false);
    if (!workerIsConfigured()) authStatus.textContent = 'После создания Worker укажите его адрес в config.js.';
    return;
  }
  try {
    const data = await api('/api/me');
    updateProfileUi(data);
    setAuthenticated(true);
    await bootstrapApp();
  } catch {
    await logout(false);
  }
};

initialize();
