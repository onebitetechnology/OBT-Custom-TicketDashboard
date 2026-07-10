const APP_VERSION = '__APP_VERSION__';
const LOCAL_ADMIN_TOKEN = __LOCAL_ADMIN_TOKEN_JSON__;
const state = {
  data: null,
  page: 0,
  pageTimer: null,
  refreshTimer: null,
  refreshCountdownTimer: null,
  nextRefreshAt: 0,
  clockTimer: null,
  calendarRotationTimer: null,
  calendarTransitionTimer: null,
  calendarRotationConfigKey: '',
  calendarRotationRunId: 0,
  refurbRotationTimer: null,
  calendarWeekOffset: 0,
  settingsLoaded: false,
  welcomeShown: false,
  logoDataUrl: '',
  sideMediaDataUrl: '',
  themeBackgroundDataUrl: '',
  ambientAudioDataUrl: '',
  ambientAudioFileName: '',
  ambientAudioPlayBlocked: false,
  displays: [],
  updateStatusTimer: null,
  updatePromptTimer: null,
  latestUpdateStatus: null,
  appLoadedAt: Date.now(),
  manualUpdatePopupUntil: 0,
  latchedUpdatePopupVersion: '',
  speechVoices: [],
  appointmentAlertHistory: {},
  alertAudioContext: null,
  rushSyncDismissedKey: '',
  desktopMetadata: null,
  apiConfig: null,
  settingsActivePanelId: 'api-section',
  discoveredSharedHosts: [],
  sharedHostDiscoveryStatus: 'idle',
  settingsOpen: false,
  refreshPausedForSettings: false,
  settingsSaving: false,
  savedPreferences: null,
};

const DEFAULT_PAGE_SECONDS = 12;
const QUEUE_COLUMN_KEYS = ['readyToStart', 'inProgress', 'needsAttention', 'waiting', 'qualityControl', 'column6'];
const UPLOAD_RULES = {
  logo: { label: 'Logo', maxBytes: 2 * 1024 * 1024, mimePrefixes: ['image/'], extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp'] },
  sideMedia: { label: 'Side media', maxBytes: 20 * 1024 * 1024, mimePrefixes: ['image/', 'video/'], extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.ogv', '.ogg'] },
  background: { label: 'Background image', maxBytes: 8 * 1024 * 1024, mimePrefixes: ['image/'], extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp'] },
  ambientAudio: { label: 'Ambient audio', maxBytes: 24 * 1024 * 1024, mimePrefixes: ['audio/'], extensions: ['.mp3', '.m4a', '.wav', '.ogg', '.oga', '.webm'] },
};

function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (LOCAL_ADMIN_TOKEN) headers.set('X-One-Bite-Admin-Token', LOCAL_ADMIN_TOKEN);
  return fetch(url, { ...options, headers });
}

function formatUploadBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} bytes`;
}

function fileExtension(file) {
  const name = String(file?.name || '').toLowerCase();
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.slice(dotIndex) : '';
}

function validateUploadFile(file, rule) {
  if (!file) return;
  if (Number(file.size || 0) > rule.maxBytes) {
    throw new Error(`${rule.label} must be ${formatUploadBytes(rule.maxBytes)} or smaller.`);
  }
  const mimeType = String(file.type || '').toLowerCase();
  const extension = fileExtension(file);
  const mimeAllowed = mimeType && rule.mimePrefixes.some((prefix) => mimeType.startsWith(prefix));
  const extensionAllowed = extension && rule.extensions.includes(extension);
  if (!mimeAllowed && !extensionAllowed) {
    throw new Error(`${rule.label} must use one of: ${rule.extensions.join(', ')}.`);
  }
}

function readFileAsDataUrl(file, rule, errorMessage) {
  validateUploadFile(file, rule);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(errorMessage));
    reader.readAsDataURL(file);
  });
}

function qs(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function params() {
  return new URLSearchParams(window.location.search);
}

function currentPreferences() {
  return state.data?.uiPreferences || state.savedPreferences || {
    schedule: {
      includedWeekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      blockedWeekdays: ['Monday'],
      temporaryBlockedDates: [],
      dailyAppointmentLimit: 0,
      sharedCalendarSync: {
        mode: 'local',
        boardName: '',
        hostUrl: '',
        sharedSecret: '',
        syncCalendarBlocks: true,
        syncAppointments: false,
        syncBrand: false,
        syncDisplay: false,
        syncTicketDetails: false,
        syncColumns: false,
        syncUpdates: false,
        cachedPreferences: {
          preferences: null,
          sourceHostUrl: '',
          syncedAt: null,
        },
      },
      showCalendar: true,
      rotateWeeks: false,
      stackWeeks: false,
      blockToday: false,
      currentWeekDurationSeconds: 20,
      nextWeekDurationSeconds: 5,
      dimPastDays: true,
      defaultLeadMinutes: 45,
      onsiteLeadMinutes: 60,
      imminentMinutes: 20,
      alertAudioEnabled: false,
      speechVoiceUri: '',
      alertAudioRules: [
        { matchMode: 'service_contains', serviceMatcher: 'onsite', leadMinutes: 60, cooldownSeconds: null, mode: 'both', message: 'On-site appointment coming up soon' },
        { matchMode: 'service_contains', serviceMatcher: 'remote', leadMinutes: 45, cooldownSeconds: null, mode: 'chime', message: 'Remote appointment coming up soon' },
      ],
    },
    staleRules: {
      inProgress: { days: 0, hours: 12 },
      needsAttention: { days: 1, hours: 0 },
      waitingOnCustomer: { days: 4, hours: 0 },
      waitingForParts: { days: 14, hours: 0 },
      qualityControl: { days: 0, hours: 1 },
    },
    brand: {
      title: 'Current Repair Queue',
      logoDataUrl: '',
      logoSize: 72,
      headerColor: '#ecf3ff',
      headerSize: 42,
      tickerEnabled: false,
      tickerText: '',
      tickerSpeedSeconds: 24,
      tickerTextColor: '#dbeafe',
      tickerFontSize: 18,
      sideMediaEnabled: false,
      sideMediaDataUrl: '',
      sideMediaWidthPercent: 38,
      backgroundImageEnabled: false,
      backgroundImageDataUrl: '',
      backgroundImageOpacityPercent: 42,
      backgroundColorStart: '#08111f',
      backgroundColorEnd: '#0d1a2b',
      textColor: '#ecf3ff',
      accentColor: '#6ee7c8',
      textScalePercent: 100,
    },
    ambientAudio: {
      enabled: false,
      audioDataUrl: '',
      fileName: '',
      volumePercent: 35,
    },
    display: {
      fullscreen: false,
      orientation: 'auto',
      displayTarget: 'current',
      densityMode: 'auto',
      customerNameMode: 'first_name_only',
      openTicketIdLinks: false,
      showAssignedTech: true,
      hideRefurbs: false,
      assigneeFilter: [],
      pulseTimingEnabled: true,
      pinPriorityTickets: false,
      priorityStrobeEnabled: true,
      priorityStrobeIntensity: 'medium',
    },
    updates: {
      receiveBetaUpdates: false,
    },
    columns: {
      appearance: {
        headerLayout: 'auto',
        headerTitleScalePercent: 100,
        headerCountScalePercent: 100,
        headerTextColor: '#f3f8ff',
        headerSurfaceColor: '#ffffff',
        headerSurfaceOpacityPercent: 10,
      },
      readyToStart: { label: 'Ready to start', visible: true, refurbMode: 'all', refurbRotateSeconds: 12, statuses: [] },
      inProgress: { label: 'In Progress', visible: true, refurbMode: 'all', refurbRotateSeconds: 12, statuses: [] },
      needsAttention: { label: 'Needs Attention', visible: true, refurbMode: 'all', refurbRotateSeconds: 12, statuses: [] },
      waiting: { label: 'Waiting', visible: true, refurbMode: 'all', refurbRotateSeconds: 12, statuses: [] },
      qualityControl: { label: 'Quality Control', visible: true, refurbMode: 'all', refurbRotateSeconds: 12, statuses: [] },
      column6: { label: 'Column 6', visible: false, refurbMode: 'all', refurbRotateSeconds: 12, statuses: [] },
    },
    };
}

async function loadSavedPreferences(options = {}) {
  if (state.savedPreferences && !options.force) return state.savedPreferences;
  const response = await apiFetch('/api/preferences');
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Could not load saved display settings');
  }
  state.savedPreferences = payload;
  applyAmbientAudioPreferences(payload);
  return payload;
}

function isSettingsOpen() {
  return !!state.settingsOpen;
}

function parseLines(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function checkboxGroupMarkup(groupId, selectedValues) {
  const selected = new Set(selectedValues || []);
  return WEEKDAY_NAMES.map((day) => `
    <label class="settings-field">
      <span class="settings-check">
        <input class="settings-checkbox" data-group="${groupId}" data-day="${day}" type="checkbox" ${selected.has(day) ? 'checked' : ''} />
        <span class="settings-check-copy">
          <span class="settings-check-title">${escapeHtml(day)}</span>
        </span>
      </span>
    </label>
  `).join('');
}

function selectedCheckboxDays(groupId) {
  return Array.from(document.querySelectorAll(`input[data-group="${groupId}"]:checked`)).map((input) => input.dataset.day);
}

function assigneeFilterMarkup(selectedValues) {
  const selected = new Set(selectedValues || []);
  const assignees = Array.isArray(state.data?.assignees) && state.data.assignees.length
    ? state.data.assignees
    : ['Unassigned'];
  return assignees.map((name) => `
    <label class="settings-field">
      <span class="settings-check">
        <input class="settings-checkbox" data-group="assignee-filter" data-assignee="${escapeHtml(name)}" type="checkbox" ${selected.has(name) ? 'checked' : ''} />
        <span class="settings-check-copy">
          <span class="settings-check-title">${escapeHtml(name)}</span>
        </span>
      </span>
    </label>
  `).join('');
}

function selectedAssignees() {
  return Array.from(document.querySelectorAll('input[data-group="assignee-filter"]:checked')).map((input) => input.dataset.assignee);
}

function refreshSpeechVoices() {
  if (!window.speechSynthesis) {
    state.speechVoices = [];
    return [];
  }
  const voices = window.speechSynthesis.getVoices() || [];
  state.speechVoices = voices
    .slice()
    .sort((a, b) => `${a.lang} ${a.name}`.localeCompare(`${b.lang} ${b.name}`));
  return state.speechVoices;
}

function populateSpeechVoiceOptions(selectedValue = '') {
  const select = qs('pref-speech-voice');
  const voices = refreshSpeechVoices();
  const availableValues = [''];
  const options = ['<option value="">System default</option>'];
  voices.forEach((voice) => {
    const voiceValue = String(voice.voiceURI || voice.name || '').trim();
    availableValues.push(voiceValue);
    const label = `${voice.name}${voice.lang ? ` (${voice.lang})` : ''}${voice.default ? ' · Default' : ''}`;
    options.push(`<option value="${escapeHtml(voiceValue)}">${escapeHtml(label)}</option>`);
  });
  select.innerHTML = options.join('');
  select.value = availableValues.includes(selectedValue) ? selectedValue : '';
}

function normalizeAlertAudioRule(rule = {}, fallback = {}) {
  const legacyType = String(rule.appointmentType || fallback.appointmentType || '').toLowerCase();
  const matchMode = ['any_service', 'service_contains'].includes(String(rule.matchMode || '').toLowerCase())
    ? String(rule.matchMode).toLowerCase()
    : (['any_service', 'service_contains'].includes(String(fallback.matchMode || '').toLowerCase())
      ? String(fallback.matchMode).toLowerCase()
      : (legacyType === 'service_match' || legacyType === 'on_site' ? 'service_contains' : 'any_service'));
  const mode = ['chime', 'speech', 'both'].includes(String(rule.mode || '').toLowerCase())
    ? String(rule.mode).toLowerCase()
    : (['chime', 'speech', 'both'].includes(String(fallback.mode || '').toLowerCase())
      ? String(fallback.mode).toLowerCase()
      : 'chime');
  const legacyMatcher = legacyType === 'on_site' ? 'onsite' : '';
  const matcher = String(rule.serviceMatcher || fallback.serviceMatcher || legacyMatcher).trim();
  const defaultMessage = matcher ? `${matcher.charAt(0).toUpperCase()}${matcher.slice(1)} appointment coming up soon` : 'Appointment coming up soon';
  const cooldownRaw = rule.cooldownSeconds ?? fallback.cooldownSeconds;
  const normalizedCooldown = cooldownRaw === '' || cooldownRaw == null
    ? null
    : Math.max(5, Number(cooldownRaw) || 0) || null;
  return {
    matchMode,
    leadMinutes: Math.max(0, Number(rule.leadMinutes ?? fallback.leadMinutes ?? 45) || 45),
    cooldownSeconds: normalizedCooldown,
    mode,
    message: String(rule.message || fallback.message || defaultMessage).trim() || defaultMessage,
    serviceMatcher: matcher,
  };
}

function defaultAlertAudioRulesFromPreferences(schedulePrefs = {}) {
  return [
    normalizeAlertAudioRule({
      matchMode: 'service_contains',
      serviceMatcher: 'remote',
      leadMinutes: schedulePrefs.defaultLeadMinutes ?? 45,
      cooldownSeconds: schedulePrefs.alertAudioCooldownSeconds ?? null,
      mode: schedulePrefs.alertAudioMode || 'chime',
      message: schedulePrefs.alertAudioMessage || 'Remote appointment coming up soon',
    }),
    normalizeAlertAudioRule({
      matchMode: 'service_contains',
      serviceMatcher: 'onsite',
      leadMinutes: schedulePrefs.onsiteLeadMinutes ?? 60,
      cooldownSeconds: schedulePrefs.alertAudioCooldownSeconds ?? null,
      mode: schedulePrefs.alertAudioMode || 'both',
      message: schedulePrefs.alertAudioMessage || 'On-site appointment coming up soon',
    }),
  ];
}

function alertAudioRulesFromPreferences(schedulePrefs = {}) {
  const savedRules = Array.isArray(schedulePrefs.alertAudioRules) && schedulePrefs.alertAudioRules.length
    ? schedulePrefs.alertAudioRules
    : defaultAlertAudioRulesFromPreferences(schedulePrefs);
  return savedRules.map((rule) => normalizeAlertAudioRule(rule));
}

function alertRuleTitle(rule, index) {
  const mode = String(rule?.matchMode || 'any_service').toLowerCase();
  const label = mode === 'service_contains'
    ? `Service contains "${String(rule?.serviceMatcher || '').trim() || '...'}"`
    : 'Any service';
  return `Rule ${index + 1} · ${label}`;
}

function alertAudioRulesMarkup(rules = []) {
  const safeRules = rules.length ? rules : defaultAlertAudioRulesFromPreferences(currentPreferences().schedule || {});
  return safeRules.map((rule, index) => {
    const normalized = normalizeAlertAudioRule(rule);
    const matcherHidden = normalized.matchMode !== 'service_contains';
    const summaryChips = [];
    summaryChips.push(matcherHidden ? 'all services' : `service: ${normalized.serviceMatcher || '...'}`);
    summaryChips.push(`${normalized.leadMinutes} min lead`);
    summaryChips.push(normalized.cooldownSeconds == null ? 'one-time' : `${normalized.cooldownSeconds}s repeat`);
    summaryChips.push(normalized.mode);
    return `
      <div class="audio-rule-card collapsed" data-alert-rule-index="${index}">
        <div class="audio-rule-head">
          <div class="audio-rule-summary">
            <div class="audio-rule-title">${escapeHtml(alertRuleTitle(normalized, index))}</div>
            <div class="audio-rule-chips">
              ${summaryChips.map((chip) => `<span class="audio-rule-chip">${escapeHtml(chip)}</span>`).join('')}
            </div>
          </div>
          <div class="audio-rule-actions-row">
            <button class="pill audio-rule-toggle" type="button" data-toggle-alert-rule="${index}">Edit</button>
            <div class="audio-rule-remove-wrap">
              <button class="pill audio-rule-remove" type="button" data-remove-alert-rule="${index}">Remove</button>
            </div>
          </div>
        </div>
        <div class="audio-rule-body">
          <div class="audio-rule-grid">
            <label class="settings-field">
              <span class="settings-label">Rule applies when</span>
              <select class="settings-input settings-select" data-alert-field="matchMode" data-alert-index="${index}">
                <option value="any_service" ${normalized.matchMode === 'any_service' ? 'selected' : ''}>Any service type</option>
                <option value="service_contains" ${normalized.matchMode === 'service_contains' ? 'selected' : ''}>Service type contains</option>
              </select>
            </label>
            <label class="settings-field">
              <span class="settings-label">Lead time (minutes)</span>
              <input class="settings-input" data-alert-field="leadMinutes" data-alert-index="${index}" type="number" min="0" step="1" value="${escapeHtml(normalized.leadMinutes)}" />
            </label>
            <label class="settings-field">
              <span class="settings-label">Repeat cooldown (seconds)</span>
              <input class="settings-input" data-alert-field="cooldownSeconds" data-alert-index="${index}" type="number" min="0" step="1" value="${normalized.cooldownSeconds == null ? '' : escapeHtml(normalized.cooldownSeconds)}" placeholder="Off" />
              <span class="settings-help">Leave blank to play this alert only once for the appointment.</span>
            </label>
            <label class="settings-field">
              <span class="settings-label">Audio type</span>
              <select class="settings-input settings-select" data-alert-field="mode" data-alert-index="${index}">
                <option value="chime" ${normalized.mode === 'chime' ? 'selected' : ''}>Chime</option>
                <option value="speech" ${normalized.mode === 'speech' ? 'selected' : ''}>Spoken message</option>
                <option value="both" ${normalized.mode === 'both' ? 'selected' : ''}>Chime and spoken message</option>
              </select>
            </label>
            <label class="settings-field" ${matcherHidden ? 'hidden' : ''}>
              <span class="settings-label">Service type contains</span>
              <input class="settings-input" data-alert-field="serviceMatcher" data-alert-index="${index}" value="${escapeHtml(normalized.serviceMatcher)}" />
            </label>
          </div>
          <label class="settings-field full">
            <span class="settings-label">Message</span>
            <input class="settings-input" data-alert-field="message" data-alert-index="${index}" value="${escapeHtml(normalized.message)}" />
          </label>
        </div>
      </div>
    `;
  }).join('');
}

function renderAlertAudioRules(rules) {
  qs('pref-alert-rules').innerHTML = alertAudioRulesMarkup(rules);
}

function collectAlertAudioRules() {
  const indices = Array.from(document.querySelectorAll('[data-alert-rule-index]'))
    .map((el) => Number(el.dataset.alertRuleIndex))
    .filter((value) => Number.isFinite(value));
  return indices.map((index) => normalizeAlertAudioRule({
    matchMode: document.querySelector(`[data-alert-field="matchMode"][data-alert-index="${index}"]`)?.value || 'any_service',
    leadMinutes: document.querySelector(`[data-alert-field="leadMinutes"][data-alert-index="${index}"]`)?.value || 0,
    cooldownSeconds: document.querySelector(`[data-alert-field="cooldownSeconds"][data-alert-index="${index}"]`)?.value ?? '',
    mode: document.querySelector(`[data-alert-field="mode"][data-alert-index="${index}"]`)?.value || 'chime',
    message: document.querySelector(`[data-alert-field="message"][data-alert-index="${index}"]`)?.value || '',
    serviceMatcher: document.querySelector(`[data-alert-field="serviceMatcher"][data-alert-index="${index}"]`)?.value || '',
  })).filter((rule) => rule.matchMode !== 'service_contains' || rule.serviceMatcher);
}

function setDisplayTargetOptions(selectedValue = 'current') {
  const select = qs('pref-display-target');
  const staticOptions = [
    { value: 'current', label: 'Current window display' },
    { value: 'primary', label: 'Primary display' },
    { value: 'secondary', label: 'Secondary display' },
  ];
  const detectedOptions = (state.displays || []).map((display) => ({
    value: `display:${display.id}`,
    label: display.isCurrent ? `${display.label} (current)` : display.label,
  }));
  const options = [...staticOptions, ...detectedOptions];
  select.innerHTML = options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('');
  select.value = options.some((option) => option.value === selectedValue) ? selectedValue : 'current';
  renderWindowDisplayLiveStatus();
}

const SETTINGS_PANEL_ORDER = [
  'api-section',
  'brand-section',
  'window-display-section',
  'appointments-section',
  'ticket-details-section',
  'columns-section',
  'updates-section',
];

function setActiveSettingsPanel(panelId) {
  const panelStage = qs('settings-panel-stage');
  if (!panelStage) return;
  const panels = [...panelStage.querySelectorAll('.settings-panel')];
  const nextPanelId = panels.some((panel) => panel.id === panelId) ? panelId : panels[0]?.id;
  if (!nextPanelId) return;
  state.settingsActivePanelId = nextPanelId;
  panels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === nextPanelId);
  });
  qs('settings-nav')?.querySelectorAll('.settings-nav-button').forEach((button) => {
    const active = button.dataset.panelTarget === nextPanelId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  panelStage.scrollTop = 0;
}

function setupSettingsNavigation() {
  const nav = qs('settings-nav');
  const panelStage = qs('settings-panel-stage');
  if (!nav || !panelStage || nav.dataset.enhanced === 'true') return;
  const panels = SETTINGS_PANEL_ORDER
    .map((id) => qs(id))
    .filter(Boolean);

  nav.innerHTML = `
    <section class="settings-nav-card">
      <div class="settings-nav-title">Control Room</div>
      <div class="settings-nav-list" id="settings-nav-list"></div>
    </section>
  `;

  const list = qs('settings-nav-list');
  panels.forEach((panel) => {
    const title = panel.querySelector(':scope > h3')?.textContent?.trim() || panel.id;
    const copy = panel.dataset.navCopy || panel.querySelector(':scope > .settings-section-copy')?.textContent?.trim() || '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-nav-button';
    button.dataset.panelTarget = panel.id;
    button.innerHTML = `
      <span class="settings-nav-button-label">${escapeHtml(title)}</span>
      <span class="settings-nav-button-copy">${escapeHtml(copy)}</span>
    `;
    button.addEventListener('click', () => {
      setActiveSettingsPanel(panel.id);
    });
    list.appendChild(button);
  });

  panels.forEach((panel) => panel.classList.add('settings-panel'));
  nav.dataset.enhanced = 'true';
  setActiveSettingsPanel(state.settingsActivePanelId || panels[0]?.id);
}

function selectedDisplayTargetLabel() {
  const select = qs('pref-display-target');
  if (!select) return 'Current window display';
  return select.options[select.selectedIndex]?.textContent || 'Current window display';
}

function displayTargetForSave() {
  const rawTarget = String(qs('pref-display-target')?.value || 'current').trim().toLowerCase() || 'current';
  if (rawTarget !== 'current') return rawTarget;
  const currentDisplayId = Number(state.desktopMetadata?.currentDisplayId || 0)
    || Number((state.displays || []).find((display) => display.isCurrent)?.id || 0);
  return currentDisplayId ? `display:${currentDisplayId}` : rawTarget;
}

function renderWindowDisplayLiveStatus() {
  const viewportValue = qs('window-display-viewport-value');
  const viewportCopy = qs('window-display-viewport-copy');
  const screenValue = qs('window-display-screen-value');
  const screenCopy = qs('window-display-screen-copy');
  const detectedValue = qs('window-display-detected-value');
  const detectedCopy = qs('window-display-detected-copy');
  const targetValue = qs('window-display-target-value');
  const targetCopy = qs('window-display-target-copy');
  const modeValue = qs('window-display-mode-value');
  const modeCopy = qs('window-display-mode-copy');
  const networkValue = qs('window-display-network-value');
  const networkCopy = qs('window-display-network-copy');
  if (!viewportValue || !viewportCopy || !screenValue || !screenCopy || !detectedValue || !detectedCopy || !targetValue || !targetCopy || !modeValue || !modeCopy || !networkValue || !networkCopy) return;

  const metadata = state.desktopMetadata || {};
  const displays = Array.isArray(state.displays) ? state.displays : [];
  const displayCount = displays.length;
  const launchContext = window.desktopApp?.getMetadata ? 'Desktop app' : 'Browser preview';
  const densityMode = String(qs('pref-display-density')?.value || currentPreferences().display?.densityMode || 'auto')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const orientation = String(qs('pref-orientation')?.value || currentPreferences().display?.orientation || 'auto');
  const fullscreen = !!qs('pref-fullscreen')?.checked;
  const screenScale = Number(window.devicePixelRatio || 1);
  const localBoardUrl = String(metadata.localBoardUrl || '').trim();
  const displayTarget = String(qs('pref-display-target')?.value || currentPreferences().display?.displayTarget || 'current').toLowerCase();
  const resolvedTargetDisplay = (() => {
    if (!displayCount) return null;
    if (displayTarget.startsWith('display:')) {
      const id = Number(displayTarget.slice('display:'.length));
      return displays.find((display) => Number(display.id) === id) || null;
    }
    if (displayTarget === 'primary') return displays.find((display) => display.isPrimary) || displays[0];
    if (displayTarget === 'secondary') return displays.find((display) => !display.isPrimary) || displays.find((display) => display.isPrimary) || displays[0];
    return displays.find((display) => display.isCurrent) || null;
  })();

  viewportValue.textContent = `${window.innerWidth} × ${window.innerHeight}`;
  viewportCopy.textContent = displayCount
    ? `${displayCount} display${displayCount === 1 ? '' : 's'} detected. ${launchContext}.`
    : `${launchContext}. Display metadata will appear here when the desktop wrapper reports it.`;

  screenValue.textContent = `${window.screen.width} × ${window.screen.height}`;
  screenCopy.textContent = `Browser screen space at ${screenScale.toFixed(screenScale % 1 ? 2 : 0)}x device scale. Helpful when Windows scaling makes a 1080p TV behave more like 1280 × 720.`;

  detectedValue.textContent = displayCount ? `${displayCount} connected` : 'No desktop data';
  detectedCopy.textContent = displayCount
    ? displays.slice(0, 2).map((display) => display.label).join(' · ') + (displayCount > 2 ? ` · +${displayCount - 2} more` : '')
    : 'Open the packaged desktop app to see detected displays and scaling details.';

  targetValue.textContent = selectedDisplayTargetLabel();
  targetCopy.textContent = resolvedTargetDisplay
    ? `Currently resolves to ${resolvedTargetDisplay.label}.`
    : 'Choose which display the packaged app should reopen on.';

  modeValue.textContent = fullscreen ? 'Fullscreen' : 'Windowed';
  modeCopy.textContent = `${orientation === 'auto' ? 'Auto layout' : `${orientation[0].toUpperCase()}${orientation.slice(1)} layout`} · ${densityMode} density`;

  networkValue.textContent = localBoardUrl ? localBoardUrl.replace(/^https?:\/\//, '') : '--';
  networkCopy.textContent = localBoardUrl
    ? `Other TVs on the network can usually follow this board at ${localBoardUrl}.`
    : 'Start the desktop app server to expose a local board URL for browser testing and shared-store sync.';
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

function formatReleaseNotesText(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  return raw
    .replace(/<\/li>\s*<li>/gi, '\n- ')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(ul|ol|p|div|br)\b[^>]*>/gi, '\n')
    .replace(/<\/?code\b[^>]*>/gi, '`')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*-\s*/gm, '- ')
    .trim();
}

function renderUpdateStatus(status = {}) {
  state.latestUpdateStatus = status || {};
  const latestVersionEl = qs('update-latest-version');
  const channelEl = qs('update-channel-label');
  const statusCopyEl = qs('update-status-copy');
  const latestVersion = String(status.version || '').trim();
  const channel = String(status.updateChannel || '').trim().toLowerCase() === 'beta' ? 'Beta + Stable' : 'Stable only';
  latestVersionEl.textContent = status.checking
    ? 'Checking...'
    : (latestVersion || (status.supported === false ? 'Manual install only' : 'Not checked yet'));
  channelEl.textContent = channel;
  statusCopyEl.textContent = status.message || 'Update checks are idle.';
  statusCopyEl.dataset.tone = status.supported === false
    ? 'warn'
    : status.downloaded
      ? 'good'
      : status.available
        ? 'warn'
        : (String(status.message || '').toLowerCase().includes('failed') || String(status.message || '').toLowerCase().includes('error'))
          ? 'danger'
          : 'neutral';

  const installBtn = qs('settings-install-update');
  installBtn.disabled = !status.downloaded || status.supported === false;
  installBtn.textContent = status.downloaded ? 'Install Update Now' : (status.available ? 'Downloading...' : 'Install Update Now');
  installBtn.classList.toggle('ready-update', !!status.downloaded && status.supported !== false);

  const progressWrap = qs('update-progress');
  const progressBar = qs('update-progress-bar');
  const detail = qs('update-progress-detail');
  const notesWrap = qs('update-notes');
  const notesLabel = qs('update-notes-label');
  const notesCopy = qs('update-notes-copy');
  const progressPercent = Math.max(0, Math.min(100, Number(status.progressPercent || 0)));
  const showProgress = progressPercent > 0 && !status.downloaded;
  progressWrap.hidden = !showProgress;
  progressBar.style.width = `${progressPercent}%`;
  const notes = formatReleaseNotesText(status.releaseNotes || '');
  notesWrap.hidden = !notes;
  notesCopy.textContent = notes;
  notesLabel.textContent = status.version ? `What’s New in ${status.version}` : 'What’s New';

  if (status.supported === false) {
    detail.textContent = 'Manual installs are required on macOS until signed and notarized builds are set up.';
    latestVersionEl.textContent = latestVersion || 'Manual install only';
  } else if (status.downloaded) {
    detail.textContent = 'The update is downloaded. Close the app to install it automatically, or use Install Update Now.';
  } else if (showProgress) {
    const speed = status.bytesPerSecond ? `${formatBytes(status.bytesPerSecond)}/s` : 'Preparing...';
    detail.textContent = `${formatBytes(status.transferredBytes)} of ${formatBytes(status.totalBytes)} downloaded at ${speed}.`;
  } else if (status.available) {
    detail.textContent = 'A new version is available and will download in the background automatically.';
  } else if (status.message && /up to date/i.test(String(status.message))) {
    detail.textContent = 'This board is already on the latest available version.';
  } else {
    detail.textContent = 'After an update is downloaded, closing the app installs it automatically.';
  }
}

function shouldShowUpdatePopup(status = {}) {
  if (!window.desktopApp?.getUpdateStatus) return false;
  if (status.supported === false) return false;
  if (!status.available) return false;
  if (!status.version) return false;
  if (status.skipped) return false;
  const version = String(status.version || '').trim();
  if (version && state.latchedUpdatePopupVersion === version) return true;
  if (Date.now() <= Number(state.manualUpdatePopupUntil || 0)) return true;
  const startupGraceMs = 15 * 60 * 1000;
  if ((Date.now() - Number(state.appLoadedAt || 0)) <= startupGraceMs) return true;
  const hour = new Date().getHours();
  return hour >= 22 || hour < 8;
}

function renderUpdatePopup(status = {}) {
  const overlay = qs('update-overlay');
  const version = String(status.version || '').trim();
  if (!status.available || !version || status.skipped) {
    state.latchedUpdatePopupVersion = '';
  }
  if (!shouldShowUpdatePopup(status)) {
    overlay.classList.remove('open');
    return;
  }

  state.latchedUpdatePopupVersion = version;
  qs('update-popup-title').textContent = status.downloaded
    ? `Update Ready: ${version}`
    : `Update Available: ${version}`;
  qs('update-popup-subtitle').textContent = status.downloaded
    ? 'The update has already been downloaded in the background. You can install it now or skip this version.'
    : 'A newer version was found during the automatic overnight/background checks. It is downloading now.';
  qs('update-popup-status-copy').textContent = status.message || 'Update available.';

  const progressWrap = qs('update-popup-progress');
  const progressBar = qs('update-popup-progress-bar');
  const progressDetail = qs('update-popup-progress-detail');
  const percent = Math.max(0, Math.min(100, Number(status.progressPercent || 0)));
  progressWrap.hidden = !!status.downloaded;
  progressBar.style.width = `${percent}%`;

  if (status.downloaded) {
    progressDetail.textContent = 'The update is downloaded and ready to install.';
  } else if (percent > 0) {
    progressDetail.textContent = `${formatBytes(status.transferredBytes)} of ${formatBytes(status.totalBytes)} downloaded.`;
  } else {
    progressDetail.textContent = 'Downloading update in the background...';
  }

  qs('update-popup-notes').textContent = formatReleaseNotesText(status.releaseNotes || 'No changelog text was included with this release.');
  const installBtn = qs('update-popup-install');
  installBtn.disabled = !status.downloaded;
  installBtn.textContent = status.downloaded ? 'Update Now' : 'Downloading...';
  installBtn.classList.toggle('ready-update', !!status.downloaded);

  overlay.classList.add('open');
}

function rushSyncStatusText(status = {}) {
  if (!status.enabled) return 'Enhanced RepairDesk Connection is off. The board is using Ticket Counter data and fee-based Priority detection only.';
  if (!status.configured) return 'Enhanced RepairDesk Connection is on, but this computer still needs a valid RepairDesk session cookie.';
  if (status.connected) {
    const checkedAt = status.lastCheckedAt
      ? ` Last checked ${new Date(status.lastCheckedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
      : '';
    return `Enhanced RepairDesk Connection is connected and watching ${Number(status.ticketCount || 0)} RepairDesk tickets (${Number(status.rushCount || 0)} true Priority).${checkedAt}`;
  }
  return `Enhanced RepairDesk Connection is disconnected. Falling back to Ticket Counter data and fee-based Priority detection.${status.lastError ? ` ${status.lastError}` : ''}`;
}

function renderRushSyncStatus(status = {}) {
  const statusEl = qs('rush-sync-status-copy');
  const statusLight = qs('rush-sync-status-light');
  if (!statusEl) return;
  statusEl.textContent = rushSyncStatusText(status);
  if (statusLight) {
    statusLight.dataset.state = !status.enabled
      ? 'disabled'
      : (status.connected ? 'connected' : 'warning');
  }
}

function apiHealthStatusText(apiHealth = {}) {
  if (!apiHealth.configured) return 'RepairDesk API key is missing. Appointment enrichment and ticket detail lookups will be limited until you add one.';
  if (apiHealth.working) {
    const checkedAt = apiHealth.checkedAt
      ? ` Last checked ${new Date(apiHealth.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
      : '';
    return `RepairDesk API key is working for this board.${checkedAt}`;
  }
  return `RepairDesk API key is saved, but the public API lookup is failing.${apiHealth.lastError ? ` ${apiHealth.lastError}` : ''}`;
}

function renderApiHealthStatus(apiHealth = {}) {
  const statusEl = qs('api-health-status-copy');
  const statusLight = qs('api-health-status-light');
  if (statusEl) {
    statusEl.textContent = apiHealthStatusText(apiHealth);
  }
  if (statusLight) {
    statusLight.dataset.state = !apiHealth.configured
      ? 'disabled'
      : (apiHealth.working ? 'connected' : 'warning');
  }
}

async function refreshConnectionHealthStatus() {
  try {
    const response = await apiFetch('/api/config/status', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Could not load connection status.');
    }
    renderApiHealthStatus(payload.apiHealth || {});
    renderRushSyncStatus(payload.rushSync || {});
    renderSharedCalendarSyncStatus(payload.calendarSync || {});
  } catch (error) {
    renderApiHealthStatus({
      configured: !!qs('api-key')?.value,
      working: false,
      checkedAt: null,
      lastError: error.message || 'Could not load connection status.',
    });
  }
}

function shouldShowRushSyncPopup(status = {}) {
  return !!(status.enabled && status.configured && status.connected === false && status.alertKey);
}

function renderRushSyncPopup(status = {}) {
  const overlay = qs('rush-sync-overlay');
  if (!overlay) return;
  if (status.connected) {
    state.rushSyncDismissedKey = '';
    overlay.classList.remove('open');
    return;
  }
  if (!shouldShowRushSyncPopup(status) || state.rushSyncDismissedKey === status.alertKey) {
    overlay.classList.remove('open');
    return;
  }
  qs('rush-sync-popup-copy').textContent = status.lastError
    ? `RepairDesk Connection could not reach RepairDesk: ${status.lastError}\n\nThe board is still running and has fallen back to Ticket Counter data plus fee-based Priority detection until you paste a fresh session cookie.`
    : 'The board has switched back to Ticket Counter data plus fee-based Priority detection until you paste a fresh session cookie.';
  overlay.classList.add('open');
}

function updateRushSyncFieldVisibility() {
  const connectField = qs('rush-sync-connect-field');
  const cookieField = qs('rush-sync-cookie-field');
  const enabled = qs('rush-sync-enabled').checked;
  if (connectField) connectField.hidden = !enabled;
  if (cookieField) cookieField.hidden = !enabled;
}

function sharedCalendarSyncStatusText(status = {}, mode = 'local') {
  const normalizedMode = String(mode || status.mode || 'local').toLowerCase();
  if (normalizedMode === 'host') {
    return 'This board is hosting shared store settings for other boards on the network.';
  }
  if (normalizedMode !== 'follow') {
    return 'Shared settings are local to this board.';
  }
  if (status.connected) {
    const syncedAt = status.lastSyncedAt
      ? ` Last synced ${new Date(status.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
      : '';
    return `Connected to the shared settings host.${syncedAt}`;
  }
  if (status.usingCached) {
    return `The host is unavailable right now, so this board is using the last synced shared settings.${status.lastError ? ` ${status.lastError}` : ''}`;
  }
  return `This board could not reach the shared settings host yet.${status.lastError ? ` ${status.lastError}` : ''}`;
}

function normalizeBoardName(value) {
  return String(value || '').trim().slice(0, 80);
}

function generateSharedStoreSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function sharedStoreSecretForSave(mode) {
  const input = qs('pref-shared-calendar-secret');
  let secret = String(input?.value || '').trim().slice(0, 128);
  if (mode === 'host' && secret.length < 16) {
    secret = generateSharedStoreSecret();
    if (input) input.value = secret;
  }
  if (mode === 'follow' && secret.length < 16) {
    throw new Error('Paste the host board key before saving Follow mode.');
  }
  return secret;
}

function renderDiscoveredSharedHosts() {
  const select = qs('pref-shared-calendar-discovered-host');
  const copy = qs('shared-calendar-discovery-copy');
  const button = qs('shared-calendar-discover-hosts');
  if (!select || !copy) return;
  const hosts = Array.isArray(state.discoveredSharedHosts) ? state.discoveredSharedHosts : [];
  const currentHostUrl = String(qs('pref-shared-calendar-host-url')?.value || '').trim();
  const options = ['<option value="">Select a discovered host…</option>'];
  hosts.forEach((host) => {
    const labelParts = [host.boardName || host.hostUrl];
    if (host.hostname) labelParts.push(host.hostname);
    if (host.appVersion) labelParts.push(host.appVersion);
    options.push(`<option value="${escapeHtml(host.hostUrl)}">${escapeHtml(labelParts.join(' · '))}</option>`);
  });
  select.innerHTML = options.join('');
  select.disabled = hosts.length === 0;
  if (currentHostUrl && hosts.some((host) => host.hostUrl === currentHostUrl)) {
    select.value = currentHostUrl;
  }
  const discoveryState = String(state.sharedHostDiscoveryStatus || 'idle');
  if (discoveryState === 'searching') {
    copy.textContent = 'Searching the local network for boards that are actively hosting shared store settings...';
  } else if (discoveryState === 'error') {
    copy.textContent = 'Could not search the network right now. You can still paste the host URL manually below.';
  } else if (discoveryState === 'empty') {
    copy.textContent = 'No host boards were found on the network. Make sure another board is set to Host mode, then try again or paste its URL manually.';
  } else if (hosts.length) {
    copy.textContent = `Found ${hosts.length} host${hosts.length === 1 ? '' : 's'} on the network. Pick one to fill the host URL automatically.`;
  } else {
    copy.textContent = 'Searches your local network for other boards that are actively hosting shared store settings.';
  }
  if (button) {
    button.dataset.state = discoveryState;
    if (discoveryState === 'searching') {
      button.textContent = 'Searching...';
    } else if (discoveryState === 'found') {
      button.textContent = 'Search Again';
    } else if (discoveryState === 'empty') {
      button.textContent = 'No Hosts Found';
    } else if (discoveryState === 'error') {
      button.textContent = 'Try Search Again';
    } else {
      button.textContent = 'Search Network';
    }
  }
}

async function discoverSharedStoreHosts() {
  const button = qs('shared-calendar-discover-hosts');
  const copy = qs('shared-calendar-discovery-copy');
  if (!button || !copy) return;
  state.sharedHostDiscoveryStatus = 'searching';
  renderDiscoveredSharedHosts();
  button.disabled = true;
  try {
    const response = await apiFetch('/api/shared-store-hosts');
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Could not search the network.');
    }
    state.discoveredSharedHosts = Array.isArray(payload.hosts) ? payload.hosts : [];
    state.sharedHostDiscoveryStatus = state.discoveredSharedHosts.length ? 'found' : 'empty';
    renderDiscoveredSharedHosts();
  } catch (error) {
    state.discoveredSharedHosts = [];
    state.sharedHostDiscoveryStatus = 'error';
    renderDiscoveredSharedHosts();
  } finally {
    button.disabled = false;
  }
}

function updateSharedCalendarSyncCopy() {
  const mode = qs('pref-shared-calendar-mode')?.value || 'local';
  const copyMap = [
    ['calendar-blocks', 'blocked weekdays and temporary appointment blocks'],
    ['appointments', 'calendar visibility, week rotation, and appointment notification preferences'],
    ['brand', 'logo, header, ticker, background, colours, and side media preferences'],
    ['display', 'fullscreen, orientation, display target, and density choices'],
    ['ticket-details', 'ticket content visibility, priority behavior, and pulse timing preferences'],
    ['columns', 'queue labels, visibility, refurb behavior, and RepairDesk status mappings'],
    ['updates', 'whether this board is opted into beta updates'],
  ];
  const action = mode === 'host'
    ? { verb: 'Pushes', noun: 'to the other boards' }
    : mode === 'follow'
      ? { verb: 'Imports', noun: 'from the host board' }
      : { verb: 'Keeps', noun: 'local to this board only' };

  copyMap.forEach(([key, description]) => {
    const help = qs(`shared-sync-help-${key}`);
    if (!help) return;
    help.textContent = `${action.verb} ${description} ${action.noun}.`;
  });

  const hostLabel = qs('shared-calendar-host-url-label');
  const hostHelp = qs('shared-calendar-host-url-help');
  if (hostLabel) {
    hostLabel.textContent = mode === 'follow' ? 'Host board URL (manual fallback)' : 'Host board URL';
  }
  if (hostHelp) {
    hostHelp.innerHTML = mode === 'follow'
      ? 'Search Network is the easiest way to connect. Keep this field as a manual fallback or troubleshooting target if auto-discovery does not find the host. The default desktop-app port is usually <code>54338</code>.'
      : 'This field is only used by follower boards. Host boards advertise their own URL below for troubleshooting and manual setup.';
  }
}

function renderSharedCalendarSyncStatus(status = {}) {
  const mode = qs('pref-shared-calendar-mode')?.value || currentPreferences().schedule?.sharedCalendarSync?.mode || status.mode || 'local';
  const statusEl = qs('shared-calendar-status-copy');
  const statusLight = qs('shared-calendar-status-light');
  if (statusEl) {
    statusEl.textContent = sharedCalendarSyncStatusText(status, mode);
  }
  if (statusLight) {
    statusLight.dataset.state = mode === 'local'
      ? 'disabled'
      : (status.connected ? 'connected' : (status.usingCached ? 'warning' : 'warning'));
  }
}

function updateSharedCalendarHostNote() {
  const noteEl = qs('shared-calendar-host-note');
  if (!noteEl) return;
  const mode = qs('pref-shared-calendar-mode')?.value || 'local';
  const hostUrl = String(qs('pref-shared-calendar-host-url')?.value || '').trim();
  const boardName = normalizeBoardName(qs('pref-shared-calendar-board-name')?.value || currentPreferences().schedule?.sharedCalendarSync?.boardName || '');
  const metadata = state.desktopMetadata || {};
  const localBoardUrl = String(metadata.localBoardUrl || '').trim();
  const networkBoardUrls = Array.isArray(metadata.networkBoardUrls) ? metadata.networkBoardUrls.filter(Boolean) : [];
  const preferredPort = metadata.preferredServerPort || 54338;

  if (mode === 'host') {
    const primaryUrl = networkBoardUrls[0] || localBoardUrl || `http://<this-board-ip>:${preferredPort}`;
    const extraUrls = networkBoardUrls.slice(1).map((url) => `<code>${escapeHtml(url)}</code>`).join(', ');
    const nameCopy = boardName ? `Boards will see this host as <strong>${escapeHtml(boardName)}</strong>. ` : '';
    noteEl.innerHTML = extraUrls
      ? `${nameCopy}Follower boards can point to <code>${escapeHtml(primaryUrl)}</code>. Other detected board URLs: ${extraUrls}.`
      : `${nameCopy}Followers can point to <code>${escapeHtml(primaryUrl)}</code>.`;
    return;
  }

  if (mode === 'follow') {
    noteEl.innerHTML = hostUrl
      ? `This board will poll <code>${escapeHtml(hostUrl)}</code> and merge the selected shared settings into its local board configuration.`
      : `Enter the host board's local network URL, for example <code>http://192.168.1.50:${preferredPort}</code>.`;
    return;
  }

  noteEl.textContent = 'Leave this on Local only if this board should keep all settings private to this machine without syncing them to or from the other TVs.';
}

function updateSharedCalendarSyncFieldVisibility() {
  const mode = qs('pref-shared-calendar-mode')?.value || 'local';
  const hostUrlField = qs('shared-calendar-host-url-field');
  const secretField = qs('shared-calendar-secret-field');
  const discoveryField = qs('shared-calendar-discovery-field');
  const syncFields = [
    qs('pref-shared-calendar-sync-calendar-blocks')?.closest('.settings-field'),
    qs('pref-shared-calendar-sync-appointments')?.closest('.settings-field'),
    qs('pref-shared-calendar-sync-brand')?.closest('.settings-field'),
    qs('pref-shared-calendar-sync-display')?.closest('.settings-field'),
    qs('pref-shared-calendar-sync-ticket-details')?.closest('.settings-field'),
    qs('pref-shared-calendar-sync-columns')?.closest('.settings-field'),
    qs('pref-shared-calendar-sync-updates')?.closest('.settings-field'),
  ].filter(Boolean);
  if (hostUrlField) hostUrlField.hidden = mode !== 'follow';
  if (secretField) secretField.hidden = mode === 'local';
  if (discoveryField) discoveryField.hidden = mode !== 'follow';
  syncFields.forEach((field) => {
    field.hidden = mode === 'local';
  });
  updateSharedCalendarSyncCopy();
  updateSharedCalendarHostNote();
  renderSharedCalendarSyncStatus(state.data?.calendarSync || {});
}

const sensitiveFieldState = {
  'ticket-counter-url': false,
  'api-key': false,
  'rush-sync-cookie': false,
  'shared-calendar-secret': false,
};

function applySensitiveFieldMasking() {
  Object.entries(sensitiveFieldState).forEach(([fieldId, revealed]) => {
    const input = document.querySelector(`[data-sensitive-input="${fieldId}"]`);
    const button = document.querySelector(`[data-sensitive-toggle="${fieldId}"]`);
    if (!input || !button) return;
    input.classList.toggle('masked', !revealed);
    input.classList.toggle('revealed', revealed);
    button.dataset.state = revealed ? 'revealed' : 'masked';
    button.textContent = revealed ? '🙈' : '👁';
    button.title = revealed ? 'Hide value' : 'Reveal value';
  });
}

function resetSensitiveFieldMasking() {
  Object.keys(sensitiveFieldState).forEach((fieldId) => {
    sensitiveFieldState[fieldId] = false;
  });
  applySensitiveFieldMasking();
}

function updateAppointmentAudioSettingsVisibility() {
  const container = qs('appointment-audio-settings');
  if (!container) return;
  container.hidden = !qs('pref-alert-audio-enabled').checked;
}

function updatePulseTimingVisibility() {
  const container = qs('ticket-pulse-settings');
  if (!container) return;
  container.hidden = !qs('pref-pulse-timing-enabled').checked;
}

async function refreshUpdateStatusAndPopup() {
  if (!window.desktopApp?.getUpdateStatus) return;
  try {
    const status = await window.desktopApp.getUpdateStatus();
    renderUpdateStatus(status || {});
    renderUpdatePopup(status || {});
  } catch (_) {}
}

async function refreshUpdateStatus() {
  if (!window.desktopApp?.getUpdateStatus) return;
  try {
    const status = await window.desktopApp.getUpdateStatus();
    renderUpdateStatus(status || {});
    renderUpdatePopup(status || {});
  } catch (_) {}
}

async function loadDetectedDisplays() {
  if (!window.desktopApp?.listDisplays) {
    setDisplayTargetOptions(currentPreferences().display?.displayTarget || 'current');
    return;
  }
  try {
    state.displays = await window.desktopApp.listDisplays();
  } catch (_) {
    state.displays = [];
  }
  setDisplayTargetOptions(currentPreferences().display?.displayTarget || 'current');
}

async function loadDesktopMetadata() {
  if (!window.desktopApp?.getMetadata) {
    state.desktopMetadata = null;
    return null;
  }
  try {
    state.desktopMetadata = await window.desktopApp.getMetadata();
  } catch (_) {
    state.desktopMetadata = null;
  }
  return state.desktopMetadata;
}

function enhanceSettingsSections() {
  setupSettingsNavigation();
}

function reorderSettingsSections() {
  // Left-nav ordering now uses SETTINGS_PANEL_ORDER instead of DOM shuffling.
}

function enhanceCollapsibleSubsections() {
  document.querySelectorAll('.collapsible-subsection').forEach((section) => {
    if (section.dataset.enhanced === 'true') return;
    const heading = section.querySelector(':scope > h4');
    if (!heading) return;
    const copy = section.querySelector(':scope > .brand-subsection-copy');
    const body = document.createElement('div');
    body.className = 'subsection-body';

    let cursor = copy ? copy.nextSibling : heading.nextSibling;
    while (cursor) {
      const next = cursor.nextSibling;
      body.appendChild(cursor);
      cursor = next;
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'subsection-head';
    toggle.innerHTML = `
      <span class="subsection-head-copy">
        <span class="brand-subsection-title">${escapeHtml(heading.textContent || '')}</span>
        ${copy ? `<span class="brand-subsection-copy">${escapeHtml(copy.textContent || '')}</span>` : ''}
      </span>
      <span class="settings-section-toggle-label subsection-toggle-label">
        <span class="settings-section-toggle-text">Show Details</span>
        <span class="settings-section-caret">▾</span>
      </span>
    `;

    heading.remove();
    if (copy) copy.remove();
    section.prepend(body);
    section.prepend(toggle);
    section.dataset.enhanced = 'true';
    section.classList.add('collapsed');
    toggle.setAttribute('aria-expanded', 'false');

    const updateToggleState = () => {
      const expanded = !section.classList.contains('collapsed');
      const textEl = toggle.querySelector('.settings-section-toggle-text');
      if (textEl) textEl.textContent = expanded ? 'Hide Details' : 'Show Details';
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      section.classList.toggle('expanded', expanded);
    };

    updateToggleState();

    toggle.addEventListener('click', () => {
      const shouldExpand = section.classList.contains('collapsed');
      if (shouldExpand) {
        const group = section.closest('.brand-subsections, .settings-grid');
        if (group) {
          group.querySelectorAll(':scope > .collapsible-subsection').forEach((sibling) => {
            if (sibling === section) return;
            sibling.classList.add('collapsed');
            const siblingToggle = sibling.querySelector(':scope > .subsection-head');
            const siblingText = siblingToggle?.querySelector('.settings-section-toggle-text');
            if (siblingText) siblingText.textContent = 'Show Details';
            if (siblingToggle) siblingToggle.setAttribute('aria-expanded', 'false');
          });
        }
        section.classList.remove('collapsed');
        requestAnimationFrame(() => {
          const panelStage = qs('settings-panel-stage');
          if (!panelStage) return;
          const sectionRect = section.getBoundingClientRect();
          const stageRect = panelStage.getBoundingClientRect();
          if (sectionRect.bottom > stageRect.bottom || sectionRect.top < stageRect.top) {
            section.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        });
      } else {
        section.classList.add('collapsed');
      }
      updateToggleState();
    });
  });
}

function effectiveNow() {
  const override = params().get('debugNow');
  if (!override) return new Date();
  const parsed = new Date(override);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function pageTitle() {
  const custom = params().get('title');
  if (!custom || custom === 'One Bite TV Queue') {
    return currentPreferences().brand?.title || 'Current Repair Queue';
  }
  return custom;
}

function normalizedLogoSize(value) {
  const size = Number(value || 0);
  if (!size) return 72;
  return Math.max(36, Math.min(180, size));
}

function normalizedHeaderSize(value) {
  const size = Number(value || 0);
  if (!size) return 42;
  return Math.max(26, Math.min(72, size));
}

function normalizedSideMediaWidth(value) {
  const width = Number(value || 0);
  if (!width) return 38;
  return Math.max(20, Math.min(70, width));
}

function normalizedTickerSpeed(value) {
  const seconds = Number(value || 0);
  if (!seconds) return 24;
  return Math.max(8, Math.min(120, seconds));
}

function normalizedTickerFontSize(value) {
  const size = Number(value || 0);
  if (!size) return 18;
  return Math.max(12, Math.min(32, size));
}

function normalizedThemeImageOpacity(value) {
  const percent = Number(value || 0);
  if (Number.isNaN(percent)) return 42;
  return Math.max(0, Math.min(100, percent));
}

function normalizedThemeTextScale(value) {
  const percent = Number(value || 0);
  if (!percent) return 100;
  return Math.max(85, Math.min(130, percent));
}

function normalizedDailyAppointmentLimit(value) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return 0;
  return Math.max(0, Math.min(12, Math.floor(limit)));
}

function normalizedAmbientAudioVolume(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 35;
  return Math.max(0, Math.min(100, percent));
}

function normalizedThemeColor(value, fallback) {
  const raw = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : fallback;
}

function normalizedColumnHeaderScale(value, fallback = 100) {
  const percent = Number(value || 0);
  if (!percent) return fallback;
  return Math.max(70, Math.min(140, percent));
}

function normalizedColumnHeaderOpacity(value, fallback = 10) {
  const percent = Number(value || 0);
  if (Number.isNaN(percent)) return fallback;
  return Math.max(0, Math.min(35, percent));
}

function normalizedColumnHeaderLayout(value, fallback = 'auto') {
  const layout = String(value || '').trim().toLowerCase();
  return ['auto', 'inline', 'stacked'].includes(layout) ? layout : fallback;
}

function hexToRgbList(value, fallback = '255, 255, 255') {
  const normalized = normalizedThemeColor(value, '');
  if (!normalized) return fallback;
  const parsed = normalized.match(/[0-9a-f]{2}/gi);
  if (!parsed || parsed.length !== 3) return fallback;
  return parsed.map((part) => parseInt(part, 16)).join(', ');
}

function syncColorControl(control) {
  if (!control) return;
  const fieldId = control.dataset.colorControl;
  const colorInput = qs(fieldId);
  const hexInput = qs(`${fieldId}-hex`);
  const fallback = control.dataset.defaultColor || '#ffffff';
  if (!colorInput || !hexInput) return;
  const normalized = normalizedThemeColor(colorInput.value, fallback);
  colorInput.value = normalized;
  hexInput.value = normalized.toUpperCase();
}

function syncAllColorControls() {
  document.querySelectorAll('[data-color-control]').forEach((control) => syncColorControl(control));
}

function wireColorControls() {
  document.querySelectorAll('[data-color-control]').forEach((control) => {
    if (control.dataset.wired === 'true') return;
    const fieldId = control.dataset.colorControl;
    const colorInput = qs(fieldId);
    const hexInput = qs(`${fieldId}-hex`);
    const resetButton = control.querySelector(`[data-color-reset="${fieldId}"]`);
    const fallback = control.dataset.defaultColor || '#ffffff';
    if (!colorInput || !hexInput) return;

    const syncFromColor = () => syncColorControl(control);
    const syncFromHex = () => {
      const normalized = normalizedThemeColor(hexInput.value, colorInput.value || fallback);
      colorInput.value = normalized;
      hexInput.value = normalized.toUpperCase();
    };

    colorInput.addEventListener('input', syncFromColor);
    colorInput.addEventListener('change', syncFromColor);
    hexInput.addEventListener('input', () => {
      const normalized = normalizedThemeColor(hexInput.value, '');
      if (!normalized) return;
      colorInput.value = normalized;
      hexInput.value = normalized.toUpperCase();
    });
    hexInput.addEventListener('blur', syncFromHex);
    if (resetButton) {
      resetButton.addEventListener('click', () => {
        colorInput.value = normalizedThemeColor(fallback, '#ffffff');
        syncColorControl(control);
        colorInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    control.dataset.wired = 'true';
    syncColorControl(control);
  });
}

function detectSideMediaType(dataUrl) {
  const value = String(dataUrl || '').trim().toLowerCase();
  if (!value) return 'none';
  if (value.startsWith('data:video/')) return 'video';
  if (value.startsWith('data:image/')) return 'image';
  return 'image';
}

function effectiveOrientation(preferences) {
  const prefs = preferences || currentPreferences();
  const selected = String(prefs.display?.orientation || 'auto').toLowerCase();
  if (selected === 'horizontal' || selected === 'vertical') return selected;
  return window.innerWidth >= window.innerHeight ? 'horizontal' : 'vertical';
}

function applyLogoPreviewSize(sizeLike) {
  const size = normalizedLogoSize(sizeLike);
  const previewEl = qs('pref-brand-logo-preview');
  previewEl.style.height = `${size}px`;
  previewEl.style.width = 'auto';
  previewEl.style.maxWidth = `${Math.max(size * 2, size)}px`;
}

function applyThemePreferences(preferences) {
  const brand = preferences?.brand || currentPreferences().brand || {};
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--bg', normalizedThemeColor(brand.backgroundColorStart, '#08111f'));
  rootStyle.setProperty('--bg2', normalizedThemeColor(brand.backgroundColorEnd, '#0d1a2b'));
  rootStyle.setProperty('--text', normalizedThemeColor(brand.textColor, '#ecf3ff'));
  rootStyle.setProperty('--accent', normalizedThemeColor(brand.accentColor, '#6ee7c8'));
  rootStyle.setProperty('--theme-text-scale', String(normalizedThemeTextScale(brand.textScalePercent || 100) / 100));
  rootStyle.setProperty('--brand-title-color', normalizedThemeColor(brand.headerColor, '#ecf3ff'));
  rootStyle.setProperty('--brand-title-size', `${normalizedHeaderSize(brand.headerSize || 42)}px`);
  rootStyle.setProperty('--ticker-text-color', normalizedThemeColor(brand.tickerTextColor, '#dbeafe'));
  rootStyle.setProperty('--ticker-font-size', `${normalizedTickerFontSize(brand.tickerFontSize || 18)}px`);

  const backgroundImage = String(brand.backgroundImageDataUrl || '').trim();
  const imageEnabled = !!brand.backgroundImageEnabled && !!backgroundImage;
  rootStyle.setProperty('--theme-bg-image', imageEnabled ? `url("${backgroundImage}")` : 'none');
  rootStyle.setProperty('--theme-bg-image-opacity', imageEnabled ? String(normalizedThemeImageOpacity(brand.backgroundImageOpacityPercent || 42) / 100) : '0');
}

function updateBrand(preferences) {
  const brand = preferences?.brand || currentPreferences().brand || {};
  applyThemePreferences(preferences);
  qs('page-title').textContent = params().get('title') && params().get('title') !== 'One Bite TV Queue'
    ? params().get('title')
    : (brand.title || 'Current Repair Queue');
  const logo = String(brand.logoDataUrl || '').trim();
  const logoSize = normalizedLogoSize(brand.logoSize || 72);
  const logoEl = qs('brand-logo');
  logoEl.style.height = `${logoSize}px`;
  logoEl.style.width = 'auto';
  logoEl.style.maxWidth = `${Math.max(logoSize * 2, logoSize)}px`;
  if (logo) {
    logoEl.src = logo;
    logoEl.classList.add('visible');
  } else {
    logoEl.removeAttribute('src');
    logoEl.classList.remove('visible');
  }

  const tickerEnabled = !!brand.tickerEnabled && !!String(brand.tickerText || '').trim();
  const tickerBar = qs('ticker-bar');
  const tickerTrack = qs('ticker-track');
  tickerBar.hidden = !tickerEnabled;
  if (tickerEnabled) {
    const tickerText = String(brand.tickerText || '').trim();
    tickerTrack.style.setProperty('--ticker-duration', `${normalizedTickerSpeed(brand.tickerSpeedSeconds || 24)}s`);
    const safeText = escapeHtml(tickerText);
    tickerTrack.innerHTML = `
      <span class="ticker-item">${safeText}</span>
      <span class="ticker-item">${safeText}</span>
      <span class="ticker-item">${safeText}</span>
      <span class="ticker-item">${safeText}</span>
    `;
  } else {
    tickerTrack.innerHTML = '';
    tickerTrack.style.removeProperty('--ticker-duration');
  }

  const boardWrap = qs('board-wrap');
  const panelEl = qs('side-media-panel');
  const imageEl = qs('side-media-image');
  const videoEl = qs('side-media-video');
  const sideMedia = String(brand.sideMediaDataUrl || '').trim();
  const sideMediaEnabled = !!brand.sideMediaEnabled && !!sideMedia && effectiveOrientation(preferences) === 'horizontal';
  boardWrap.style.setProperty('--side-media-width', `${normalizedSideMediaWidth(brand.sideMediaWidthPercent || 38)}%`);
  boardWrap.classList.toggle('media-hidden', !sideMediaEnabled);
  panelEl.hidden = !sideMediaEnabled;

  if (!sideMediaEnabled) {
    imageEl.removeAttribute('src');
    imageEl.classList.remove('visible');
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.classList.remove('visible');
    return;
  }

  const mediaType = detectSideMediaType(sideMedia);
  if (mediaType === 'video') {
    imageEl.removeAttribute('src');
    imageEl.classList.remove('visible');
    if (videoEl.src !== sideMedia) {
      videoEl.src = sideMedia;
      videoEl.load();
    }
    videoEl.classList.add('visible');
    videoEl.play().catch(() => {});
    return;
  }

  videoEl.pause();
  videoEl.removeAttribute('src');
  videoEl.classList.remove('visible');
  imageEl.src = sideMedia;
  imageEl.classList.add('visible');
}

function applyAmbientAudioPreferences(preferences) {
  const audioEl = qs('ambient-audio');
  if (!audioEl) return;
  const ambient = preferences?.ambientAudio || currentPreferences().ambientAudio || {};
  const audioDataUrl = String(ambient.audioDataUrl || '').trim();
  const enabled = !!ambient.enabled && !!audioDataUrl;
  audioEl.volume = normalizedAmbientAudioVolume(ambient.volumePercent ?? 35) / 100;

  if (!enabled) {
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();
    state.ambientAudioPlayBlocked = false;
    return;
  }

  audioEl.loop = true;
  if (audioEl.getAttribute('src') !== audioDataUrl) {
    audioEl.setAttribute('src', audioDataUrl);
    audioEl.load();
  }

  audioEl.play()
    .then(() => {
      state.ambientAudioPlayBlocked = false;
    })
    .catch(() => {
      state.ambientAudioPlayBlocked = true;
    });
}

function setLogoPreview(logoDataUrl, labelText = '') {
  const previewEl = qs('pref-brand-logo-preview');
  const nameEl = qs('pref-brand-logo-name');
  const noteEl = qs('pref-brand-logo-note');
  applyLogoPreviewSize(qs('pref-brand-logo-size')?.value || currentPreferences().brand?.logoSize || 72);
  const logo = String(logoDataUrl || '').trim();
  if (logo) {
    previewEl.src = logo;
    previewEl.classList.add('visible');
    nameEl.textContent = labelText || 'Stored logo';
    noteEl.textContent = 'Preview of the logo saved for the board header.';
    return;
  }
  previewEl.removeAttribute('src');
  previewEl.classList.remove('visible');
  nameEl.textContent = 'No logo uploaded';
  noteEl.textContent = 'Upload a logo to preview how it will appear in the board header.';
}

function setSideMediaPreview(sideMediaDataUrl, labelText = '') {
  const imageEl = qs('pref-brand-side-media-preview-image');
  const videoEl = qs('pref-brand-side-media-preview-video');
  const nameEl = qs('pref-brand-side-media-name');
  const noteEl = qs('pref-brand-side-media-note');
  const media = String(sideMediaDataUrl || '').trim();
  const mediaType = detectSideMediaType(media);

  if (!media) {
    imageEl.removeAttribute('src');
    imageEl.classList.remove('visible');
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.classList.remove('visible');
    nameEl.textContent = 'No side media uploaded';
    noteEl.textContent = 'Upload an image, GIF, or muted looping video to show beside the board on horizontal layouts.';
    return;
  }

  if (mediaType === 'video') {
    imageEl.removeAttribute('src');
    imageEl.classList.remove('visible');
    videoEl.src = media;
    videoEl.classList.add('visible');
    videoEl.load();
    videoEl.play().catch(() => {});
    nameEl.textContent = labelText || 'Stored video';
    noteEl.textContent = 'Preview of the video saved for the horizontal side media panel.';
    return;
  }

  videoEl.pause();
  videoEl.removeAttribute('src');
  videoEl.classList.remove('visible');
  imageEl.src = media;
  imageEl.classList.add('visible');
  nameEl.textContent = labelText || 'Stored image';
  noteEl.textContent = 'Preview of the media saved for the horizontal side media panel.';
}

function setThemeBackgroundPreview(backgroundDataUrl, labelText = '') {
  const previewEl = qs('pref-brand-background-image-preview');
  const nameEl = qs('pref-brand-background-image-name');
  const noteEl = qs('pref-brand-background-image-note');
  const image = String(backgroundDataUrl || '').trim();
  if (image) {
    previewEl.src = image;
    previewEl.classList.add('visible');
    nameEl.textContent = labelText || 'Stored background image';
    noteEl.textContent = 'Preview of the uploaded board background image for this shop.';
    return;
  }
  previewEl.removeAttribute('src');
  previewEl.classList.remove('visible');
  nameEl.textContent = 'No custom background image uploaded';
  noteEl.textContent = 'Upload a background image to preview how the board backdrop will look for this shop.';
}

function setAmbientAudioPreview(audioDataUrl, fileName = '', enabled = false) {
  const nameEl = qs('pref-ambient-audio-name');
  const noteEl = qs('pref-ambient-audio-note');
  const statusEl = qs('pref-ambient-audio-status');
  const hasAudio = !!String(audioDataUrl || '').trim();
  statusEl.textContent = enabled && hasAudio ? 'Loop enabled' : 'Disabled';
  if (hasAudio) {
    nameEl.textContent = fileName || 'Stored audio file';
    noteEl.textContent = enabled
      ? 'This audio file will loop on this display after settings are saved.'
      : 'This audio file is saved locally but looping is currently turned off.';
    return;
  }
  nameEl.textContent = 'No ambient audio uploaded';
  noteEl.textContent = 'Upload an MP3, M4A, WAV, or OGG file to loop on this display.';
}

function waitingToneClass(waitingDays) {
  if (waitingDays == null || Number.isNaN(Number(waitingDays))) return 'neutral';
  if (waitingDays >= 7) return 'danger';
  if (waitingDays >= 4) return 'warn';
  if (waitingDays >= 1) return 'good';
  return 'neutral';
}

function waitingBadge(waitingDays, waitingHours) {
  if (waitingDays == null && waitingHours == null) {
    return 'Waiting age n/a';
  }
  if (Number.isFinite(Number(waitingDays)) && Number(waitingDays) >= 1) {
    const dayCount = Number(waitingDays);
    return `<span class="wait-box-number">${escapeHtml(dayCount)}</span><span class="wait-box-label">${dayCount === 1 ? 'Day' : 'Days'}</span>`;
  }
  if (Number.isFinite(Number(waitingHours))) {
    const hourCount = Number(waitingHours);
    return `<span class="wait-box-number">${escapeHtml(hourCount)}</span><span class="wait-box-label">${hourCount === 1 ? 'Hour' : 'Hours'}</span>`;
  }
  return `<span class="wait-box-number">${escapeHtml(waitingDays)}</span><span class="wait-box-label">Days</span>`;
}

function cardsPerPage() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width >= 1800 && height >= 950) return 24;
  if (width >= 1400) return 18;
  if (width >= 1000) return 12;
  return 6;
}

function formatTimeOnly(dateLike) {
  if (!dateLike) return '';
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function localDateKey(dateLike) {
  if (!dateLike) return '';
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatScheduleDayLabel(label, isoDate) {
  if (!isoDate) return label;
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return label;
  const dayOfMonth = date.getDate();
  const suffix = (dayOfMonth % 10 === 1 && dayOfMonth % 100 !== 11) ? 'st'
    : (dayOfMonth % 10 === 2 && dayOfMonth % 100 !== 12) ? 'nd'
    : (dayOfMonth % 10 === 3 && dayOfMonth % 100 !== 13) ? 'rd'
    : 'th';
  const month = date.toLocaleDateString([], { month: 'long' });
  return `${label} - ${month} ${dayOfMonth}${suffix}`;
}

function appointmentUrgencyMeta(dateLike, serviceName) {
  if (!dateLike) return { className: '' };
  const appt = new Date(dateLike);
  if (Number.isNaN(appt.getTime())) return { className: '' };
  const now = effectiveNow();
  const sameDay = appt.toDateString() === now.toDateString();
  if (!sameDay) return { className: '' };

  const minutesUntil = (appt.getTime() - now.getTime()) / 60000;
  const prefs = currentPreferences();
  const onsite = /on[\s-]?site/i.test(String(serviceName || ''));
  const advanceMinutes = onsite ? Number(prefs.schedule.onsiteLeadMinutes || 60) : Number(prefs.schedule.defaultLeadMinutes || 45);
  if (minutesUntil > advanceMinutes || minutesUntil <= 0) {
    return { className: '' };
  }
  if (minutesUntil <= Number(prefs.schedule.imminentMinutes || 20)) {
    return { className: 'imminent' };
  }

  const imminentMinutes = Number(prefs.schedule.imminentMinutes || 20);
  const progress = (advanceMinutes - minutesUntil) / Math.max(1, (advanceMinutes - imminentMinutes));
  const urgencySpeed = progress >= 0.66 ? 'urgent-fast' : (progress >= 0.33 ? 'urgent-medium' : 'urgent-slow');
  return { className: `urgent ${urgencySpeed}` };
}

function ensureAlertAudioContext() {
  if (state.alertAudioContext) return state.alertAudioContext;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  state.alertAudioContext = new AudioCtor();
  return state.alertAudioContext;
}

function unlockAlertAudio() {
  const context = ensureAlertAudioContext();
  if (context && context.state === 'suspended') {
    context.resume().catch(() => {});
  }
  if (state.ambientAudioPlayBlocked) {
    applyAmbientAudioPreferences(currentPreferences());
  }
}

function playAppointmentChime() {
  const context = ensureAlertAudioContext();
  if (!context) return;
  if (context.state === 'suspended') {
    context.resume().catch(() => {});
  }

  const now = context.currentTime;
  const notes = [
    { frequency: 880, start: now, duration: 0.12 },
    { frequency: 1174.66, start: now + 0.12, duration: 0.14 },
    { frequency: 1318.51, start: now + 0.26, duration: 0.18 },
  ];

  notes.forEach((note) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(note.frequency, note.start);
    gain.gain.setValueAtTime(0.0001, note.start);
    gain.gain.exponentialRampToValueAtTime(0.06, note.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, note.start + note.duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(note.start);
    osc.stop(note.start + note.duration + 0.02);
  });
}

function playAppointmentSpeech(message) {
  const text = String(message || '').trim();
  if (!text || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voiceUri = String(currentPreferences().schedule?.speechVoiceUri || '').trim();
  if (voiceUri) {
    const voices = refreshSpeechVoices();
    const selectedVoice = voices.find((voice) => String(voice.voiceURI || voice.name || '').trim() === voiceUri);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      if (selectedVoice.lang) utterance.lang = selectedVoice.lang;
    }
  }
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

function appointmentMatchesAlertRule(appointment, rule) {
  const matchMode = String(rule?.matchMode || 'any_service').toLowerCase();
  const serviceName = String(appointment?.device || '');
  if (matchMode === 'any_service') return true;
  if (matchMode === 'service_contains') {
    const matcher = String(rule?.serviceMatcher || '').trim().toLowerCase();
    return !!matcher && serviceName.toLowerCase().includes(matcher);
  }
  return false;
}

function appointmentAlertCandidates(data) {
  const days = currentCalendarDays(data);
  const rules = alertAudioRulesFromPreferences(data?.uiPreferences?.schedule || currentPreferences().schedule || {});
  const candidates = [];
  days.forEach((day) => {
    (day.appointments || []).forEach((appointment) => {
      const urgency = appointmentUrgencyMeta(appointment.dueAt || appointment.dueOn, appointment.device || '');
      if (!urgency.className) return;
      const appointmentDate = new Date(appointment.dueAt || appointment.dueOn);
      if (Number.isNaN(appointmentDate.getTime())) return;
      const now = effectiveNow();
      const minutesUntil = (appointmentDate.getTime() - now.getTime()) / 60000;
      const matchingRule = rules
        .filter((rule) => appointmentMatchesAlertRule(appointment, rule))
        .filter((rule) => minutesUntil <= Number(rule.leadMinutes || 0) && minutesUntil > 0)
        .sort((a, b) => Number(a.leadMinutes || 0) - Number(b.leadMinutes || 0))[0];
      if (!matchingRule) return;
      candidates.push({
        ...appointment,
        alertRule: matchingRule,
        urgencyClass: urgency.className,
        minutesUntil,
        sortTime: new Date(appointment.dueAt || appointment.dueOn).getTime() || Number.MAX_SAFE_INTEGER,
      });
    });
  });
  return candidates.sort((a, b) => {
    const urgencyRank = (value) => (value === 'imminent' ? 0 : 1);
    if (urgencyRank(a.urgencyClass) !== urgencyRank(b.urgencyClass)) {
      return urgencyRank(a.urgencyClass) - urgencyRank(b.urgencyClass);
    }
    return a.sortTime - b.sortTime;
  });
}

function maybePlayAppointmentAlert(data) {
  const prefs = data?.uiPreferences?.schedule || currentPreferences().schedule || {};
  if (!prefs.alertAudioEnabled) return;
  const candidates = appointmentAlertCandidates(data);
  if (!candidates.length) return;

  const now = Date.now();
  const historyRetentionMs = 7 * 24 * 60 * 60 * 1000;
  const appointmentRetentionMs = 3 * 24 * 60 * 60 * 1000;
  Object.keys(state.appointmentAlertHistory).forEach((key) => {
    const entry = state.appointmentAlertHistory[key];
    const playedAt = typeof entry === 'object' ? Number(entry.playedAt || 0) : Number(entry || 0);
    const dueAtMs = typeof entry === 'object' ? Number(entry.dueAtMs || 0) : 0;
    if ((playedAt && (now - playedAt) > historyRetentionMs) || (dueAtMs && now > (dueAtMs + appointmentRetentionMs))) {
      delete state.appointmentAlertHistory[key];
    }
  });

  const nextAlert = candidates[0];
  const rule = normalizeAlertAudioRule(nextAlert.alertRule || {});
  const alertKey = `${nextAlert.orderId}|${nextAlert.dueAt || nextAlert.dueOn}|${rule.matchMode}|${rule.serviceMatcher}|${rule.leadMinutes}|${rule.mode}`;
  const lastEntry = state.appointmentAlertHistory[alertKey];
  const lastPlayedAt = typeof lastEntry === 'object' ? Number(lastEntry.playedAt || 0) : Number(lastEntry || 0);
  if (lastPlayedAt) {
    if (rule.cooldownSeconds == null) return;
    const cooldownMs = rule.cooldownSeconds * 1000;
    if ((now - lastPlayedAt) < cooldownMs) return;
  }

  state.appointmentAlertHistory[alertKey] = {
    playedAt: now,
    dueAtMs: nextAlert.sortTime || 0,
  };
  const mode = rule.mode;
  const message = rule.message;

  if (mode === 'chime' || mode === 'both') {
    playAppointmentChime();
  }
  if (mode === 'speech' || mode === 'both') {
    playAppointmentSpeech(message);
  }
}

function fillSettingsForm(preferences) {
  const prefs = preferences || currentPreferences();
  qs('pref-brand-title').value = prefs.brand?.title || 'Current Repair Queue';
  qs('pref-brand-logo-size').value = prefs.brand?.logoSize ?? 72;
  qs('pref-brand-header-color').value = prefs.brand?.headerColor || '#ecf3ff';
  qs('pref-brand-header-size').value = prefs.brand?.headerSize ?? 42;
  qs('pref-brand-ticker-enabled').checked = !!prefs.brand?.tickerEnabled;
  qs('pref-brand-ticker-text').value = prefs.brand?.tickerText || '';
  qs('pref-brand-ticker-speed').value = prefs.brand?.tickerSpeedSeconds ?? 24;
  qs('pref-brand-ticker-text-color').value = prefs.brand?.tickerTextColor || '#dbeafe';
  qs('pref-brand-ticker-font-size').value = prefs.brand?.tickerFontSize ?? 18;
  setLogoPreview(prefs.brand?.logoDataUrl || '', prefs.brand?.logoDataUrl ? 'Stored logo' : '');
  qs('pref-brand-side-media-enabled').checked = !!prefs.brand?.sideMediaEnabled;
  qs('pref-brand-side-media-width').value = prefs.brand?.sideMediaWidthPercent ?? 38;
  setSideMediaPreview(
    prefs.brand?.sideMediaDataUrl || '',
    prefs.brand?.sideMediaDataUrl ? `Stored ${detectSideMediaType(prefs.brand?.sideMediaDataUrl || '')}` : ''
  );
  state.ambientAudioDataUrl = prefs.ambientAudio?.audioDataUrl || '';
  state.ambientAudioFileName = prefs.ambientAudio?.fileName || '';
  qs('pref-ambient-audio-enabled').checked = !!prefs.ambientAudio?.enabled;
  qs('pref-ambient-audio-volume').value = normalizedAmbientAudioVolume(prefs.ambientAudio?.volumePercent ?? 35);
  setAmbientAudioPreview(
    prefs.ambientAudio?.audioDataUrl || '',
    prefs.ambientAudio?.fileName || '',
    !!prefs.ambientAudio?.enabled
  );
  qs('pref-brand-background-image-enabled').checked = !!prefs.brand?.backgroundImageEnabled;
  qs('pref-brand-background-image-opacity').value = prefs.brand?.backgroundImageOpacityPercent ?? 42;
  qs('pref-brand-background-start').value = prefs.brand?.backgroundColorStart || '#08111f';
  qs('pref-brand-background-end').value = prefs.brand?.backgroundColorEnd || '#0d1a2b';
  qs('pref-brand-text-color').value = prefs.brand?.textColor || '#ecf3ff';
  qs('pref-brand-accent-color').value = prefs.brand?.accentColor || '#6ee7c8';
  qs('pref-brand-text-scale').value = prefs.brand?.textScalePercent ?? 100;
  qs('pref-columns-header-layout').value = prefs.columns?.appearance?.headerLayout || 'auto';
  qs('pref-columns-header-title-scale').value = prefs.columns?.appearance?.headerTitleScalePercent ?? 100;
  qs('pref-columns-header-count-scale').value = prefs.columns?.appearance?.headerCountScalePercent ?? 100;
  qs('pref-columns-header-text-color').value = prefs.columns?.appearance?.headerTextColor || '#f3f8ff';
  qs('pref-columns-header-surface-color').value = prefs.columns?.appearance?.headerSurfaceColor || '#ffffff';
  qs('pref-columns-header-surface-opacity').value = prefs.columns?.appearance?.headerSurfaceOpacityPercent ?? 10;
  setThemeBackgroundPreview(
    prefs.brand?.backgroundImageDataUrl || '',
    prefs.brand?.backgroundImageDataUrl ? 'Stored background image' : ''
  );
  qs('pref-fullscreen').checked = !!prefs.display?.fullscreen;
  qs('pref-orientation').value = prefs.display?.orientation || 'auto';
  setDisplayTargetOptions(prefs.display?.displayTarget || 'current');
  qs('pref-display-density').value = prefs.display?.densityMode || 'auto';
  qs('pref-customer-name-mode').value = prefs.display?.customerNameMode || 'first_name_only';
  qs('pref-open-ticket-id-links').checked = !!prefs.display?.openTicketIdLinks;
  qs('pref-show-assigned-tech').checked = prefs.display?.showAssignedTech !== false;
  qs('pref-assignee-filter').innerHTML = assigneeFilterMarkup(prefs.display?.assigneeFilter || []);
  qs('pref-pulse-timing-enabled').checked = prefs.display?.pulseTimingEnabled !== false;
  qs('pref-pin-priority-tickets').checked = !!prefs.display?.pinPriorityTickets;
  qs('pref-priority-strobe-enabled').checked = prefs.display?.priorityStrobeEnabled !== false;
  qs('pref-priority-strobe-intensity').value = prefs.display?.priorityStrobeIntensity || 'medium';
  qs('pref-receive-beta-updates').checked = !!prefs.updates?.receiveBetaUpdates;
  qs('pref-included-weekdays').innerHTML = checkboxGroupMarkup('included-weekdays', prefs.schedule.includedWeekdays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  qs('pref-show-calendar').checked = prefs.schedule.showCalendar !== false;
  qs('pref-rotate-weeks').checked = !!prefs.schedule.rotateWeeks;
  qs('pref-stack-weeks').checked = !!prefs.schedule.stackWeeks;
  qs('pref-block-today').checked = !!prefs.schedule.blockToday;
  qs('pref-daily-appointment-limit').value = normalizedDailyAppointmentLimit(prefs.schedule.dailyAppointmentLimit ?? 0);
  qs('pref-current-week-duration-seconds').value = prefs.schedule.currentWeekDurationSeconds ?? 20;
  qs('pref-next-week-duration-seconds').value = prefs.schedule.nextWeekDurationSeconds ?? 5;
  qs('pref-blocked-weekdays').innerHTML = checkboxGroupMarkup('blocked-weekdays', prefs.schedule.blockedWeekdays || []);
  qs('pref-temporary-blocked-dates').value = (prefs.schedule.temporaryBlockedDates || []).join('\n');
  qs('pref-shared-calendar-mode').value = prefs.schedule?.sharedCalendarSync?.mode || 'local';
  qs('pref-shared-calendar-board-name').value = prefs.schedule?.sharedCalendarSync?.boardName || '';
  qs('pref-shared-calendar-host-url').value = prefs.schedule?.sharedCalendarSync?.hostUrl || '';
  qs('pref-shared-calendar-secret').value = prefs.schedule?.sharedCalendarSync?.sharedSecret || '';
  qs('pref-shared-calendar-sync-calendar-blocks').checked = prefs.schedule?.sharedCalendarSync?.syncCalendarBlocks !== false;
  qs('pref-shared-calendar-sync-appointments').checked = !!prefs.schedule?.sharedCalendarSync?.syncAppointments;
  qs('pref-shared-calendar-sync-brand').checked = !!prefs.schedule?.sharedCalendarSync?.syncBrand;
  qs('pref-shared-calendar-sync-display').checked = !!prefs.schedule?.sharedCalendarSync?.syncDisplay;
  qs('pref-shared-calendar-sync-ticket-details').checked = !!prefs.schedule?.sharedCalendarSync?.syncTicketDetails;
  qs('pref-shared-calendar-sync-columns').checked = !!prefs.schedule?.sharedCalendarSync?.syncColumns;
  qs('pref-shared-calendar-sync-updates').checked = !!prefs.schedule?.sharedCalendarSync?.syncUpdates;
  qs('pref-dim-past-days').checked = prefs.schedule.dimPastDays !== false;
  qs('pref-default-lead').value = prefs.schedule.defaultLeadMinutes ?? 45;
  qs('pref-onsite-lead').value = prefs.schedule.onsiteLeadMinutes ?? 60;
  qs('pref-imminent-minutes').value = prefs.schedule.imminentMinutes ?? 20;
  qs('pref-alert-audio-enabled').checked = !!prefs.schedule.alertAudioEnabled;
  populateSpeechVoiceOptions(prefs.schedule?.speechVoiceUri || '');
  renderAlertAudioRules(alertAudioRulesFromPreferences(prefs.schedule || {}));
  updateAppointmentAudioSettingsVisibility();
  updateCalendarWeekModeVisibility();
  updatePulseTimingVisibility();
  renderSharedCalendarSyncStatus(state.data?.calendarSync || {});
  updateSharedCalendarSyncFieldVisibility();
  renderDiscoveredSharedHosts();
  qs('pref-inprogress-days').value = prefs.staleRules.inProgress?.days ?? 0;
  qs('pref-inprogress-hours').value = prefs.staleRules.inProgress?.hours ?? 12;
  qs('pref-attention-days').value = prefs.staleRules.needsAttention?.days ?? 1;
  qs('pref-attention-hours').value = prefs.staleRules.needsAttention?.hours ?? 0;
  qs('pref-wait-customer-days').value = prefs.staleRules.waitingOnCustomer?.days ?? 4;
  qs('pref-wait-customer-hours').value = prefs.staleRules.waitingOnCustomer?.hours ?? 0;
  qs('pref-wait-parts-days').value = prefs.staleRules.waitingForParts?.days ?? 14;
  qs('pref-wait-parts-hours').value = prefs.staleRules.waitingForParts?.hours ?? 0;
  qs('pref-qc-days').value = prefs.staleRules.qualityControl?.days ?? 0;
  qs('pref-qc-hours').value = prefs.staleRules.qualityControl?.hours ?? 1;
  qs('pref-ready-label').value = prefs.columns.readyToStart.label || 'Ready to start';
  qs('pref-ready-refurbs').value = prefs.columns.readyToStart.refurbMode || 'all';
  qs('pref-ready-refurb-seconds').value = prefs.columns.readyToStart.refurbRotateSeconds ?? 12;
  qs('pref-ready-statuses').value = (prefs.columns.readyToStart.statuses || []).join('\n');
  qs('pref-ready-visible').checked = prefs.columns.readyToStart.visible !== false;
  qs('pref-progress-label').value = prefs.columns.inProgress.label || 'In Progress';
  qs('pref-progress-refurbs').value = prefs.columns.inProgress.refurbMode || 'all';
  qs('pref-progress-refurb-seconds').value = prefs.columns.inProgress.refurbRotateSeconds ?? 12;
  qs('pref-progress-statuses').value = (prefs.columns.inProgress.statuses || []).join('\n');
  qs('pref-progress-visible').checked = prefs.columns.inProgress.visible !== false;
  qs('pref-attention-label').value = prefs.columns.needsAttention.label || 'Needs Attention';
  qs('pref-attention-refurbs').value = prefs.columns.needsAttention.refurbMode || 'all';
  qs('pref-attention-refurb-seconds').value = prefs.columns.needsAttention.refurbRotateSeconds ?? 12;
  qs('pref-attention-statuses').value = (prefs.columns.needsAttention.statuses || []).join('\n');
  qs('pref-attention-visible').checked = prefs.columns.needsAttention.visible !== false;
  qs('pref-waiting-label').value = prefs.columns.waiting.label || 'Waiting';
  qs('pref-waiting-refurbs').value = prefs.columns.waiting.refurbMode || 'all';
  qs('pref-waiting-refurb-seconds').value = prefs.columns.waiting.refurbRotateSeconds ?? 12;
  qs('pref-waiting-statuses').value = (prefs.columns.waiting.statuses || []).join('\n');
  qs('pref-waiting-visible').checked = prefs.columns.waiting.visible !== false;
  qs('pref-qc-label').value = prefs.columns.qualityControl.label || 'Quality Control';
  qs('pref-qc-refurbs').value = prefs.columns.qualityControl.refurbMode || 'all';
  qs('pref-qc-refurb-seconds').value = prefs.columns.qualityControl.refurbRotateSeconds ?? 12;
  qs('pref-qc-statuses').value = (prefs.columns.qualityControl.statuses || []).join('\n');
  qs('pref-qc-visible').checked = prefs.columns.qualityControl.visible !== false;
  qs('pref-column6-label').value = prefs.columns.column6?.label || 'Column 6';
  qs('pref-column6-refurbs').value = prefs.columns.column6?.refurbMode || 'all';
  qs('pref-column6-refurb-seconds').value = prefs.columns.column6?.refurbRotateSeconds ?? 12;
  qs('pref-column6-statuses').value = (prefs.columns.column6?.statuses || []).join('\n');
  qs('pref-column6-visible').checked = prefs.columns.column6?.visible === true;
  renderRushSyncStatus(state.data?.rushSync || {});
  updateRushSyncFieldVisibility();
  resetSensitiveFieldMasking();
  syncAllColorControls();
  renderWindowDisplayLiveStatus();
  qs('settings-status').textContent = '';
}

function collectSettingsForm() {
  return {
    brand: {
      title: qs('pref-brand-title').value || 'Current Repair Queue',
      logoDataUrl: state.logoDataUrl || currentPreferences().brand?.logoDataUrl || '',
      logoSize: normalizedLogoSize(qs('pref-brand-logo-size').value || currentPreferences().brand?.logoSize || 72),
      headerColor: normalizedThemeColor(qs('pref-brand-header-color').value, currentPreferences().brand?.headerColor || '#ecf3ff'),
      headerSize: normalizedHeaderSize(qs('pref-brand-header-size').value || currentPreferences().brand?.headerSize || 42),
      tickerEnabled: qs('pref-brand-ticker-enabled').checked,
      tickerText: qs('pref-brand-ticker-text').value || '',
      tickerSpeedSeconds: normalizedTickerSpeed(qs('pref-brand-ticker-speed').value || currentPreferences().brand?.tickerSpeedSeconds || 24),
      tickerTextColor: normalizedThemeColor(qs('pref-brand-ticker-text-color').value, currentPreferences().brand?.tickerTextColor || '#dbeafe'),
      tickerFontSize: normalizedTickerFontSize(qs('pref-brand-ticker-font-size').value || currentPreferences().brand?.tickerFontSize || 18),
      sideMediaEnabled: qs('pref-brand-side-media-enabled').checked,
      sideMediaDataUrl: state.sideMediaDataUrl || currentPreferences().brand?.sideMediaDataUrl || '',
      sideMediaWidthPercent: normalizedSideMediaWidth(qs('pref-brand-side-media-width').value || currentPreferences().brand?.sideMediaWidthPercent || 38),
      backgroundImageEnabled: qs('pref-brand-background-image-enabled').checked,
      backgroundImageDataUrl: state.themeBackgroundDataUrl || currentPreferences().brand?.backgroundImageDataUrl || '',
      backgroundImageOpacityPercent: normalizedThemeImageOpacity(qs('pref-brand-background-image-opacity').value || currentPreferences().brand?.backgroundImageOpacityPercent || 42),
      backgroundColorStart: normalizedThemeColor(qs('pref-brand-background-start').value, currentPreferences().brand?.backgroundColorStart || '#08111f'),
      backgroundColorEnd: normalizedThemeColor(qs('pref-brand-background-end').value, currentPreferences().brand?.backgroundColorEnd || '#0d1a2b'),
      textColor: normalizedThemeColor(qs('pref-brand-text-color').value, currentPreferences().brand?.textColor || '#ecf3ff'),
      accentColor: normalizedThemeColor(qs('pref-brand-accent-color').value, currentPreferences().brand?.accentColor || '#6ee7c8'),
      textScalePercent: normalizedThemeTextScale(qs('pref-brand-text-scale').value || currentPreferences().brand?.textScalePercent || 100),
    },
    ambientAudio: {
      enabled: qs('pref-ambient-audio-enabled').checked,
      audioDataUrl: state.ambientAudioDataUrl || currentPreferences().ambientAudio?.audioDataUrl || '',
      fileName: state.ambientAudioFileName || currentPreferences().ambientAudio?.fileName || '',
      volumePercent: normalizedAmbientAudioVolume(qs('pref-ambient-audio-volume').value),
    },
    display: {
      fullscreen: qs('pref-fullscreen').checked,
      orientation: qs('pref-orientation').value || 'auto',
      displayTarget: displayTargetForSave(),
      densityMode: qs('pref-display-density').value || 'auto',
      customerNameMode: qs('pref-customer-name-mode').value || 'first_name_only',
      openTicketIdLinks: qs('pref-open-ticket-id-links').checked,
      showAssignedTech: qs('pref-show-assigned-tech').checked,
      assigneeFilter: selectedAssignees(),
      pulseTimingEnabled: qs('pref-pulse-timing-enabled').checked,
      pinPriorityTickets: qs('pref-pin-priority-tickets').checked,
      priorityStrobeEnabled: qs('pref-priority-strobe-enabled').checked,
      priorityStrobeIntensity: qs('pref-priority-strobe-intensity').value || 'medium',
    },
    updates: {
      receiveBetaUpdates: qs('pref-receive-beta-updates').checked,
    },
    schedule: {
      includedWeekdays: selectedCheckboxDays('included-weekdays'),
      showCalendar: qs('pref-show-calendar').checked,
      rotateWeeks: qs('pref-rotate-weeks').checked,
      stackWeeks: qs('pref-stack-weeks').checked,
      blockToday: qs('pref-block-today').checked,
      dailyAppointmentLimit: normalizedDailyAppointmentLimit(qs('pref-daily-appointment-limit').value),
      currentWeekDurationSeconds: Math.max(5, Number(qs('pref-current-week-duration-seconds').value || 20) || 20),
      nextWeekDurationSeconds: Math.max(5, Number(qs('pref-next-week-duration-seconds').value || 5) || 5),
      blockedWeekdays: selectedCheckboxDays('blocked-weekdays'),
      temporaryBlockedDates: qs('pref-temporary-blocked-dates').value
        .split(/\r?\n/)
        .map((value) => String(value || '').trim())
        .filter(Boolean),
      sharedCalendarSync: {
        mode: qs('pref-shared-calendar-mode').value || 'local',
        boardName: normalizeBoardName(qs('pref-shared-calendar-board-name').value || currentPreferences().schedule?.sharedCalendarSync?.boardName || ''),
        hostUrl: qs('pref-shared-calendar-host-url').value || '',
        sharedSecret: sharedStoreSecretForSave(qs('pref-shared-calendar-mode').value || 'local'),
        syncCalendarBlocks: qs('pref-shared-calendar-sync-calendar-blocks').checked,
        syncAppointments: qs('pref-shared-calendar-sync-appointments').checked,
        syncBrand: qs('pref-shared-calendar-sync-brand').checked,
        syncDisplay: qs('pref-shared-calendar-sync-display').checked,
        syncTicketDetails: qs('pref-shared-calendar-sync-ticket-details').checked,
        syncColumns: qs('pref-shared-calendar-sync-columns').checked,
        syncUpdates: qs('pref-shared-calendar-sync-updates').checked,
        cachedPreferences: currentPreferences().schedule?.sharedCalendarSync?.cachedPreferences || {
          preferences: null,
          sourceHostUrl: '',
          syncedAt: null,
        },
      },
      dimPastDays: qs('pref-dim-past-days').checked,
      defaultLeadMinutes: Number(qs('pref-default-lead').value || 0),
      onsiteLeadMinutes: Number(qs('pref-onsite-lead').value || 0),
      imminentMinutes: Number(qs('pref-imminent-minutes').value || 0),
      alertAudioEnabled: qs('pref-alert-audio-enabled').checked,
      speechVoiceUri: qs('pref-speech-voice').value || '',
      alertAudioRules: collectAlertAudioRules(),
    },
    staleRules: {
      inProgress: {
        days: Number(qs('pref-inprogress-days').value || 0),
        hours: Number(qs('pref-inprogress-hours').value || 0),
      },
      needsAttention: {
        days: Number(qs('pref-attention-days').value || 0),
        hours: Number(qs('pref-attention-hours').value || 0),
      },
      waitingOnCustomer: {
        days: Number(qs('pref-wait-customer-days').value || 0),
        hours: Number(qs('pref-wait-customer-hours').value || 0),
      },
      waitingForParts: {
        days: Number(qs('pref-wait-parts-days').value || 0),
        hours: Number(qs('pref-wait-parts-hours').value || 0),
      },
      qualityControl: {
        days: Number(qs('pref-qc-days').value || 0),
        hours: Number(qs('pref-qc-hours').value || 0),
      },
    },
    columns: {
      appearance: {
        headerLayout: normalizedColumnHeaderLayout(qs('pref-columns-header-layout').value, currentPreferences().columns?.appearance?.headerLayout || 'auto'),
        headerTitleScalePercent: normalizedColumnHeaderScale(qs('pref-columns-header-title-scale').value || currentPreferences().columns?.appearance?.headerTitleScalePercent || 100),
        headerCountScalePercent: normalizedColumnHeaderScale(qs('pref-columns-header-count-scale').value || currentPreferences().columns?.appearance?.headerCountScalePercent || 100),
        headerTextColor: normalizedThemeColor(qs('pref-columns-header-text-color').value, currentPreferences().columns?.appearance?.headerTextColor || '#f3f8ff'),
        headerSurfaceColor: normalizedThemeColor(qs('pref-columns-header-surface-color').value, currentPreferences().columns?.appearance?.headerSurfaceColor || '#ffffff'),
        headerSurfaceOpacityPercent: normalizedColumnHeaderOpacity(qs('pref-columns-header-surface-opacity').value || currentPreferences().columns?.appearance?.headerSurfaceOpacityPercent || 10),
      },
      readyToStart: { label: qs('pref-ready-label').value || 'Ready to start', visible: qs('pref-ready-visible').checked, refurbMode: qs('pref-ready-refurbs').value || 'all', refurbRotateSeconds: Math.max(5, Number(qs('pref-ready-refurb-seconds').value || 12) || 12), statuses: parseLines(qs('pref-ready-statuses').value) },
      inProgress: { label: qs('pref-progress-label').value || 'In Progress', visible: qs('pref-progress-visible').checked, refurbMode: qs('pref-progress-refurbs').value || 'all', refurbRotateSeconds: Math.max(5, Number(qs('pref-progress-refurb-seconds').value || 12) || 12), statuses: parseLines(qs('pref-progress-statuses').value) },
      needsAttention: { label: qs('pref-attention-label').value || 'Needs Attention', visible: qs('pref-attention-visible').checked, refurbMode: qs('pref-attention-refurbs').value || 'all', refurbRotateSeconds: Math.max(5, Number(qs('pref-attention-refurb-seconds').value || 12) || 12), statuses: parseLines(qs('pref-attention-statuses').value) },
      waiting: { label: qs('pref-waiting-label').value || 'Waiting', visible: qs('pref-waiting-visible').checked, refurbMode: qs('pref-waiting-refurbs').value || 'all', refurbRotateSeconds: Math.max(5, Number(qs('pref-waiting-refurb-seconds').value || 12) || 12), statuses: parseLines(qs('pref-waiting-statuses').value) },
      qualityControl: { label: qs('pref-qc-label').value || 'Quality Control', visible: qs('pref-qc-visible').checked, refurbMode: qs('pref-qc-refurbs').value || 'all', refurbRotateSeconds: Math.max(5, Number(qs('pref-qc-refurb-seconds').value || 12) || 12), statuses: parseLines(qs('pref-qc-statuses').value) },
      column6: { label: qs('pref-column6-label').value || 'Column 6', visible: qs('pref-column6-visible').checked, refurbMode: qs('pref-column6-refurbs').value || 'all', refurbRotateSeconds: Math.max(5, Number(qs('pref-column6-refurb-seconds').value || 12) || 12), statuses: parseLines(qs('pref-column6-statuses').value) },
    },
  };
}

function visibleQueueColumnCount(preferences) {
  const columns = preferences?.columns || currentPreferences().columns;
  return Math.max(1, QUEUE_COLUMN_KEYS.map((columnKey) => columns?.[columnKey]).filter((column) => column?.visible !== false).length);
}

function applyQueueColumnLayout(preferences) {
  const queueColumnsEl = document.querySelector('.queue-columns');
  if (!queueColumnsEl) return;
  const visibleCount = visibleQueueColumnCount(preferences);
  const orientation = effectiveOrientation(preferences);

  if (window.innerWidth <= 900) {
    queueColumnsEl.style.gridTemplateColumns = '1fr';
    return;
  }

  if (window.innerWidth <= 1200 && orientation !== 'vertical') {
    queueColumnsEl.style.gridTemplateColumns = `repeat(${Math.min(2, visibleCount)}, minmax(0, 1fr))`;
    return;
  }

  queueColumnsEl.style.gridTemplateColumns = `repeat(${visibleCount}, minmax(0, 1fr))`;
}

function applyViewportDensity(preferences) {
  const orientation = effectiveOrientation(preferences);
  const height = window.innerHeight;
  const width = window.innerWidth;
  const densityMode = String(preferences?.display?.densityMode || 'auto').toLowerCase();
  const autoCompact = height <= 760 || (orientation === 'horizontal' && height <= 860 && width / Math.max(height, 1) >= 1.45);
  const compact = densityMode === 'compact' || densityMode === 'extra_compact' || (densityMode === 'auto' && autoCompact);
  const extraCompact = densityMode === 'extra_compact';
  document.body.classList.toggle('compact-display', compact || extraCompact);
  document.body.classList.toggle('extra-compact-display', extraCompact);
}

function applyColumnAppearancePreferences(preferences) {
  const appearance = preferences?.columns?.appearance || currentPreferences().columns?.appearance || {};
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--column-header-title-scale', String(normalizedColumnHeaderScale(appearance.headerTitleScalePercent || 100) / 100));
  rootStyle.setProperty('--column-header-count-scale', String(normalizedColumnHeaderScale(appearance.headerCountScalePercent || 100) / 100));
  rootStyle.setProperty('--column-header-text', normalizedThemeColor(appearance.headerTextColor, '#f3f8ff'));
  rootStyle.setProperty('--column-header-overlay-rgb', hexToRgbList(appearance.headerSurfaceColor, '255, 255, 255'));
  rootStyle.setProperty('--column-header-overlay-opacity', String(normalizedColumnHeaderOpacity(appearance.headerSurfaceOpacityPercent, 10) / 100));
  document.body.dataset.columnHeaderLayout = normalizedColumnHeaderLayout(appearance.headerLayout, 'auto');
}

function applyDisplayPreferences(preferences) {
  const prefs = preferences || currentPreferences();
  const orientation = prefs.display?.orientation || 'auto';
  document.body.classList.toggle('force-horizontal', orientation === 'horizontal');
  document.body.classList.toggle('force-vertical', orientation === 'vertical');
  applyViewportDensity(prefs);
  document.body.dataset.priorityStrobeEnabled = prefs.display?.priorityStrobeEnabled === false ? 'false' : 'true';
  document.body.dataset.priorityStrobeIntensity = prefs.display?.priorityStrobeIntensity || 'medium';
  qs('ready-column').hidden = prefs.columns.readyToStart.visible === false;
  qs('progress-column').hidden = prefs.columns.inProgress.visible === false;
  qs('attention-column').hidden = prefs.columns.needsAttention.visible === false;
  qs('waiting-column').hidden = prefs.columns.waiting.visible === false;
  qs('qc-column').hidden = prefs.columns.qualityControl.visible === false;
  qs('column6-column').hidden = prefs.columns.column6?.visible !== true;
  applyColumnAppearancePreferences(prefs);
  applyQueueColumnLayout(prefs);
}

function pulseTimingEnabled(preferences) {
  const prefs = preferences || currentPreferences();
  return prefs?.display?.pulseTimingEnabled !== false;
}

function applyPreferenceLabels(preferences) {
  const prefs = preferences || currentPreferences();
  qs('ready-title').textContent = prefs.columns.readyToStart.label;
  qs('progress-title').textContent = prefs.columns.inProgress.label;
  qs('attention-title').textContent = prefs.columns.needsAttention.label;
  qs('waiting-title').textContent = prefs.columns.waiting.label;
  qs('qc-title').textContent = prefs.columns.qualityControl.label;
  qs('column6-title').textContent = prefs.columns.column6?.label || 'Column 6';
}

async function loadApiConfig() {
  const response = await apiFetch('/api/config');
  const payload = await response.json();
  state.apiConfig = payload;
  qs('api-key').value = payload.apiKey || '';
  qs('ticket-counter-url').value = payload.ticketCounterDisplayUrl || '';
  qs('rush-sync-enabled').checked = !!payload.rushSyncEnabled;
  qs('rush-sync-cookie').value = payload.rushSyncCookie || '';
  updateRushSyncFieldVisibility();
  applySensitiveFieldMasking();
  return payload;
}

async function saveApiConfig() {
  const nextConfig = {
    apiKey: qs('api-key').value,
    ticketCounterDisplayUrl: qs('ticket-counter-url').value,
    rushSyncEnabled: qs('rush-sync-enabled').checked,
    rushSyncCookie: qs('rush-sync-cookie').value,
  };
  const response = await apiFetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nextConfig),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Could not save API settings');
  }
  state.apiConfig = nextConfig;
}

function openWelcomeModal(prefill = {}) {
  qs('welcome-shop-name').value = prefill.shopName || currentPreferences().brand?.title || 'Current Repair Queue';
  qs('welcome-ticket-url').value = prefill.ticketCounterDisplayUrl || '';
  qs('welcome-api-key').value = prefill.apiKey || '';
  qs('welcome-status').textContent = '';
  qs('welcome-overlay').classList.add('open');
  state.welcomeShown = true;
}

function closeWelcomeModal() {
  qs('welcome-overlay').classList.remove('open');
}

async function maybeShowWelcome(configPayload = null) {
  if (state.welcomeShown) return;
  const config = configPayload || await loadApiConfig();
  if (String(config?.ticketCounterDisplayUrl || '').trim()) return;
  openWelcomeModal({
    shopName: currentPreferences().brand?.title || 'Current Repair Queue',
    ticketCounterDisplayUrl: String(config?.ticketCounterDisplayUrl || '').trim(),
    apiKey: String(config?.apiKey || '').trim(),
  });
}

async function saveWelcomeSetup() {
  const shopName = String(qs('welcome-shop-name').value || '').trim();
  const ticketCounterDisplayUrl = String(qs('welcome-ticket-url').value || '').trim();
  const apiKey = String(qs('welcome-api-key').value || '').trim();
  if (!ticketCounterDisplayUrl) {
    qs('welcome-status').textContent = 'Ticket Counter Display URL is required.';
    return;
  }

  try {
    qs('welcome-status').textContent = 'Saving...';
    const nextPreferences = {
      ...currentPreferences(),
      brand: {
        ...(currentPreferences().brand || {}),
        title: shopName || 'Current Repair Queue',
      },
    };

    const configResponse = await apiFetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, ticketCounterDisplayUrl }),
    });
    const configPayload = await configResponse.json();
    if (!configResponse.ok) {
      throw new Error(configPayload.error || 'Could not save API key');
    }

    const prefResponse = await apiFetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextPreferences),
    });
    const prefPayload = await prefResponse.json();
    if (!prefResponse.ok) {
      throw new Error(prefPayload.error || 'Could not save shop name');
    }

    state.settingsLoaded = false;
    closeWelcomeModal();
    await loadFeed();
  } catch (error) {
    qs('welcome-status').textContent = error.message || 'Could not save setup.';
  }
}

function readSelectedLogo() {
  const file = qs('pref-brand-logo').files && qs('pref-brand-logo').files[0];
  if (!file) return Promise.resolve(state.logoDataUrl || currentPreferences().brand?.logoDataUrl || '');
  return readFileAsDataUrl(file, UPLOAD_RULES.logo, 'Could not read logo file');
}

function readSelectedSideMedia() {
  const file = qs('pref-brand-side-media').files && qs('pref-brand-side-media').files[0];
  if (!file) return Promise.resolve(state.sideMediaDataUrl || currentPreferences().brand?.sideMediaDataUrl || '');
  return readFileAsDataUrl(file, UPLOAD_RULES.sideMedia, 'Could not read side media file');
}

function readSelectedThemeBackground() {
  const file = qs('pref-brand-background-image').files && qs('pref-brand-background-image').files[0];
  if (!file) return Promise.resolve(state.themeBackgroundDataUrl || currentPreferences().brand?.backgroundImageDataUrl || '');
  return readFileAsDataUrl(file, UPLOAD_RULES.background, 'Could not read background image file');
}

function readSelectedAmbientAudio() {
  const file = qs('pref-ambient-audio-file').files && qs('pref-ambient-audio-file').files[0];
  if (!file) {
    return Promise.resolve({
      audioDataUrl: state.ambientAudioDataUrl || currentPreferences().ambientAudio?.audioDataUrl || '',
      fileName: state.ambientAudioFileName || currentPreferences().ambientAudio?.fileName || '',
    });
  }
  return readFileAsDataUrl(file, UPLOAD_RULES.ambientAudio, 'Could not read ambient audio file')
    .then((audioDataUrl) => ({
      audioDataUrl,
      fileName: String(file.name || '').trim(),
    }));
}

function totalPages() {
  if (!state.data || !state.data.tickets.length) return 1;
  return Math.max(1, Math.ceil(state.data.tickets.length / cardsPerPage()));
}

function useCompactTopbarSummaryLabels() {
  if (document.body.classList.contains('force-vertical')) return true;
  const headWidth = document.querySelector('.topbar-head')?.clientWidth || window.innerWidth || 0;
  return headWidth > 0 && headWidth <= 1400;
}

function renderSummary(data) {
  const compact = useCompactTopbarSummaryLabels();
  const openCount = data?.totals?.tickets ?? 0;
  const boardCardCount = data?.totals?.boardTickets ?? openCount;
  const regularAgeLabel = data?.totals?.oldestRegularReadyLabel || (data?.totals?.oldestRegularReadyDays == null ? '--' : (data.totals.oldestRegularReadyDays + 'd'));
  const priorityAgeLabel = data?.totals?.oldestPriorityReadyLabel || (data?.totals?.oldestPriorityReadyDays == null ? 'None' : (data.totals.oldestPriorityReadyDays + 'd'));
  qs('open-tickets-pill').textContent = compact
    ? ('Open ' + openCount)
    : ('Open Tickets ' + openCount);
  qs('oldest-regular-pill').textContent = compact
    ? ('Regular ' + regularAgeLabel)
    : ('Oldest Regular Ticket ' + regularAgeLabel);
  qs('oldest-priority-pill').textContent = compact
    ? ('Priority ' + priorityAgeLabel)
    : ('Oldest Priority Ticket ' + priorityAgeLabel);
  qs('open-tickets-pill').title = openCount === boardCardCount
    ? `${openCount} active tickets in the current Ticket Counter feed`
    : `${openCount} active Ticket Counter rows; ${boardCardCount} merged ticket cards on this board`;
}

function renderStatuses(data) {
  qs('status-row').innerHTML = '';
  qs('status-row').style.display = 'none';
}

function updateCalendarWeekModeVisibility() {
  const rotateWeeks = !!qs('pref-rotate-weeks')?.checked;
  const stackWeeks = !!qs('pref-stack-weeks')?.checked;
  const hideRotationDurations = !rotateWeeks || stackWeeks;
  const currentField = qs('pref-current-week-duration-field');
  const nextField = qs('pref-next-week-duration-field');
  if (currentField) currentField.hidden = hideRotationDurations;
  if (nextField) nextField.hidden = hideRotationDurations;
}

function currentCalendarDays(data) {
  const schedulePrefs = data?.uiPreferences?.schedule || {};
  const rotateWeeks = !!schedulePrefs.rotateWeeks && !schedulePrefs.stackWeeks;
  const useNextWeek = rotateWeeks && state.calendarWeekOffset === 1;
  return useNextWeek ? (data.nextScheduledCalendar || []) : (data.scheduledCalendar || []);
}

function currentCalendarTitle(data) {
  const schedulePrefs = data?.uiPreferences?.schedule || {};
  if (schedulePrefs.stackWeeks) return "This & Next Week's Appointments";
  const rotateWeeks = !!schedulePrefs.rotateWeeks;
  const useNextWeek = rotateWeeks && state.calendarWeekOffset === 1;
  return useNextWeek ? "Next Week's Appointments" : "This Week's Appointments";
}

function scheduleDayMarkup(day, data, todayIso) {
  const appointmentCount = Array.isArray(day.appointments) ? day.appointments.length : 0;
  const appointmentCountLabel = appointmentCount === 1 ? '1 appt' : `${appointmentCount} appt`;
  const limitReached = !!day.appointmentLimitReached;
  const countLabel = limitReached && Number(day.dailyAppointmentLimit || 0) > 0
    ? `${appointmentCount}/${Number(day.dailyAppointmentLimit)} full`
    : (day.blocked ? 'Off limits' : appointmentCountLabel);
  const blockedNote = day.blocked ? `<div class="schedule-note">${escapeHtml(day.blockedReason || 'No booking window on this day')}</div>` : '';
  const appointmentItems = appointmentCount ? day.appointments.slice(0, 4).map((appt) => {
    const urgency = appointmentUrgencyMeta(appt.dueAt || appt.dueOn, appt.device || '');
    return `
          <div class="schedule-item ${urgency.className}">
            <div class="schedule-top">
              <div class="schedule-ticket">T-${escapeHtml(appt.orderId)}</div>
              <div class="schedule-time">${escapeHtml(formatTimeOnly(appt.dueAt || appt.dueOn))}</div>
            </div>
            <div class="schedule-name">${escapeHtml(appt.customerName)}</div>
            <div class="schedule-device">${escapeHtml(appt.device || 'Tech Support')}</div>
          </div>
        `;
  }).join('') : `<div class="schedule-empty">${day.blocked ? escapeHtml(day.blockedReason || 'Blocked for appointments') : 'No appointments'}</div>`;
  return `
    <article class="schedule-day${day.blocked ? ' blocked' : ''}${limitReached ? ' appointment-full' : ''}${data.uiPreferences?.schedule?.dimPastDays !== false && day.iso < todayIso ? ' past-day' : ''}">
      <div class="schedule-head">
        <div class="schedule-label">${escapeHtml(formatScheduleDayLabel(day.label, day.iso))}</div>
        <div class="schedule-count${day.blocked ? ' blocked' : ''}${limitReached ? ' full' : ''}">${escapeHtml(countLabel)}</div>
      </div>
      <div class="schedule-items">
        ${appointmentItems}
      </div>
      ${appointmentCount ? blockedNote : ''}
    </article>
  `;
}

function renderSchedule(data) {
  const schedulePrefs = data?.uiPreferences?.schedule || {};
  const stackWeeks = !!schedulePrefs.stackWeeks;
  const days = currentCalendarDays(data);
  const todayIso = localDateKey(effectiveNow());
  qs('schedule-panel-title').textContent = currentCalendarTitle(data);
  qs('schedule-panel-sub').textContent = stackWeeks
    ? 'This week on top, next week underneath'
    : (days.length ? `${days.length} day view` : 'No included weekdays selected');
  const strip = qs('schedule-strip');
  strip.classList.toggle('stacked-weeks', stackWeeks);
  if (stackWeeks) {
    const thisWeek = data.scheduledCalendar || [];
    const nextWeek = data.nextScheduledCalendar || [];
    strip.innerHTML = [
      { title: 'This Week', sub: thisWeek.length ? `${thisWeek.length} day view` : 'No included weekdays selected', days: thisWeek },
      { title: 'Next Week', sub: nextWeek.length ? `${nextWeek.length} day view` : 'No included weekdays selected', days: nextWeek },
    ].map((week) => `
      <section class="schedule-week-stack">
        <div class="schedule-week-stack-head">
          <h3 class="schedule-week-stack-title">${escapeHtml(week.title)}</h3>
          <div class="schedule-week-stack-sub">${escapeHtml(week.sub)}</div>
        </div>
        <div class="schedule-week-grid">
          ${week.days.map((day) => scheduleDayMarkup(day, data, todayIso)).join('')}
        </div>
      </section>
    `).join('');
    maybePlayAppointmentAlert(data);
    return;
  }
  strip.innerHTML = days.map((day) => scheduleDayMarkup(day, data, todayIso)).join('');
  maybePlayAppointmentAlert(data);
}

function calendarRotationConfigKey(schedulePrefs = {}) {
  return JSON.stringify({
    rotateWeeks: !!schedulePrefs.rotateWeeks,
    stackWeeks: !!schedulePrefs.stackWeeks,
    blockToday: !!schedulePrefs.blockToday,
    currentWeekDurationSeconds: Math.max(5, Number(schedulePrefs.currentWeekDurationSeconds || 20) || 20),
    nextWeekDurationSeconds: Math.max(5, Number(schedulePrefs.nextWeekDurationSeconds || 5) || 5),
    showCalendar: schedulePrefs.showCalendar !== false,
    includedWeekdays: Array.isArray(schedulePrefs.includedWeekdays) ? schedulePrefs.includedWeekdays : [],
    blockedWeekdays: Array.isArray(schedulePrefs.blockedWeekdays) ? schedulePrefs.blockedWeekdays : [],
    temporaryBlockedDates: Array.isArray(schedulePrefs.temporaryBlockedDates) ? schedulePrefs.temporaryBlockedDates : [],
  });
}

function clearCalendarRotationTimers() {
  if (state.calendarRotationTimer) {
    clearTimeout(state.calendarRotationTimer);
    state.calendarRotationTimer = null;
  }
  if (state.calendarTransitionTimer) {
    clearTimeout(state.calendarTransitionTimer);
    state.calendarTransitionTimer = null;
  }
}

function setupCalendarRotation() {
  const schedulePrefs = state.data?.uiPreferences?.schedule || {};
  const nextConfigKey = calendarRotationConfigKey(schedulePrefs);
  const rotateWeeks = !!schedulePrefs.rotateWeeks && !schedulePrefs.stackWeeks;

  if (!rotateWeeks) {
    clearCalendarRotationTimers();
    state.calendarRotationRunId += 1;
    state.calendarRotationConfigKey = nextConfigKey;
    state.calendarWeekOffset = 0;
    return;
  }

  const configChanged = state.calendarRotationConfigKey !== nextConfigKey;
  state.calendarRotationConfigKey = nextConfigKey;
  if (!configChanged && state.calendarRotationTimer) return;

  clearCalendarRotationTimers();
  state.calendarRotationRunId += 1;
  const runId = state.calendarRotationRunId;
  if (configChanged) {
    state.calendarWeekOffset = 0;
    renderSchedule(state.data);
  }

  const scheduleNextRotation = () => {
    const intervalSeconds = state.calendarWeekOffset === 0
      ? Math.max(5, Number(schedulePrefs.currentWeekDurationSeconds || 20) || 20)
      : Math.max(5, Number(schedulePrefs.nextWeekDurationSeconds || 5) || 5);
    state.calendarRotationTimer = setTimeout(() => {
      if (runId !== state.calendarRotationRunId) return;
      const strip = qs('schedule-strip');
      strip.classList.add('fading');
      state.calendarTransitionTimer = setTimeout(() => {
        if (runId !== state.calendarRotationRunId) return;
        state.calendarWeekOffset = state.calendarWeekOffset === 0 ? 1 : 0;
        renderSchedule(state.data);
        strip.classList.remove('fading');
        state.calendarTransitionTimer = null;
        scheduleNextRotation();
      }, 240);
    }, intervalSeconds * 1000);
  };
  scheduleNextRotation();
}

function updateAlertRuleVisibility() {
  document.querySelectorAll('[data-alert-rule-index]').forEach((card) => {
    const index = card.dataset.alertRuleIndex;
    const typeSelect = document.querySelector(`[data-alert-field="matchMode"][data-alert-index="${index}"]`);
    const matcherField = document.querySelector(`[data-alert-field="serviceMatcher"][data-alert-index="${index}"]`)?.closest('.settings-field');
    if (!typeSelect || !matcherField) return;
    matcherField.hidden = typeSelect.value !== 'service_contains';
  });
}

function setSettingsSaving(isSaving) {
  state.settingsSaving = !!isSaving;
  const drawer = qs('settings-drawer');
  if (!drawer) return;
  drawer.classList.toggle('is-saving', state.settingsSaving);
  drawer.setAttribute('aria-busy', state.settingsSaving ? 'true' : 'false');

  drawer.querySelectorAll('.settings-layout input, .settings-layout select, .settings-layout textarea, .settings-layout button, #settings-close, #settings-close-bottom, #settings-save')
    .forEach((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement || element instanceof HTMLButtonElement)) return;
      if (state.settingsSaving) {
        if (element.dataset.settingsSaveManaged === 'true') return;
        element.dataset.settingsSaveManaged = 'true';
        element.dataset.settingsWasDisabled = element.disabled ? 'true' : 'false';
        element.disabled = true;
      } else if (element.dataset.settingsSaveManaged === 'true') {
        element.disabled = element.dataset.settingsWasDisabled === 'true';
        delete element.dataset.settingsSaveManaged;
        delete element.dataset.settingsWasDisabled;
      }
    });
}

async function openSettings() {
  const drawer = qs('settings-drawer');
  state.settingsOpen = true;
  setSettingsSaving(false);
  drawer.classList.add('open');
  qs('settings-status').textContent = '';
  drawer.scrollTop = 0;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  try {
    await loadSavedPreferences({ force: !state.data });
  } catch (error) {
    if (!state.data) {
      qs('settings-status').textContent = error.message || 'Could not load saved display settings.';
    }
  }
  state.logoDataUrl = currentPreferences().brand?.logoDataUrl || '';
  state.sideMediaDataUrl = currentPreferences().brand?.sideMediaDataUrl || '';
  state.themeBackgroundDataUrl = currentPreferences().brand?.backgroundImageDataUrl || '';
  state.ambientAudioDataUrl = currentPreferences().ambientAudio?.audioDataUrl || '';
  state.ambientAudioFileName = currentPreferences().ambientAudio?.fileName || '';
  fillSettingsForm(currentPreferences());
  setActiveSettingsPanel(state.settingsActivePanelId || 'api-section');
  updateAlertRuleVisibility();
  loadApiConfig().catch(() => {
    qs('settings-status').textContent = 'Could not load API settings.';
  });
  refreshConnectionHealthStatus();
  loadDesktopMetadata().then(() => {
    updateSharedCalendarHostNote();
    renderWindowDisplayLiveStatus();
  });
  loadDetectedDisplays().then(() => {
    renderWindowDisplayLiveStatus();
  });
  refreshUpdateStatus();
  if (state.updateStatusTimer) clearInterval(state.updateStatusTimer);
  state.updateStatusTimer = setInterval(refreshUpdateStatus, 1500);
  pauseBoardRefreshForSettings();
  requestAnimationFrame(() => {
    drawer.scrollTop = 0;
    drawer.querySelector('.settings-head')?.scrollIntoView?.({ block: 'start' });
    qs('settings-close')?.focus({ preventScroll: true });
  });
}

function filterColumnItems(items, refurbMode, refurbRotateSeconds) {
  const mode = String(refurbMode || 'all');
  const source = Array.isArray(items) ? items : [];
  const customerItems = source.filter((ticket) => !ticket.isRefurb);
  const refurbItems = source.filter((ticket) => ticket.isRefurb);

  if (mode === 'hide_refurbs') {
    return { items: customerItems, countLabel: `${customerItems.length} tickets` };
  }
  if (mode === 'only_refurbs') {
    return { items: refurbItems, countLabel: `${refurbItems.length} tickets` };
  }
  if (mode === 'rotate_refurbs') {
    const intervalSeconds = Math.max(5, Number(refurbRotateSeconds || 12) || 12);
    const showingRefurbs = Math.floor(Date.now() / (intervalSeconds * 1000)) % 2 === 1;
    const activeItems = showingRefurbs ? refurbItems : customerItems;
    return {
      items: activeItems,
      countLabel: `${activeItems.length} ${showingRefurbs ? 'refurb' : 'customer'} tickets`,
    };
  }
  return { items: source, countLabel: `${source.length} tickets` };
}

function setupRefurbRotation() {
  if (state.refurbRotationTimer) clearInterval(state.refurbRotationTimer);
  state.refurbRotationTimer = null;
  const columns = state.data?.uiPreferences?.columns || {};
  const hasRotatingColumn = QUEUE_COLUMN_KEYS.some((columnKey) => columns?.[columnKey]?.refurbMode === 'rotate_refurbs');
  if (!hasRotatingColumn) return;
  state.refurbRotationTimer = setInterval(() => {
    renderBoard(state.data);
  }, 1000);
}

function renderBoard(data) {
  qs('page-dots').innerHTML = '';
}

function repairDeskBaseUrl() {
  const displayUrlCandidates = [
    String(params().get('displayUrl') || '').trim(),
    String(state.apiConfig?.ticketCounterDisplayUrl || '').trim(),
    String(qs('ticket-counter-url')?.value || '').trim(),
  ].filter(Boolean);
  for (const rawUrl of displayUrlCandidates) {
    try {
      const parsed = new URL(rawUrl);
      return `${parsed.protocol}//${parsed.host}`;
    } catch (_) {
      continue;
    }
  }
  return '';
}

function repairDeskTicketUrl(ticket) {
  if (!currentPreferences().display?.openTicketIdLinks) return '';
  const internalTicketId = String(ticket?.internalTicketId || '').trim();
  if (!internalTicketId) return '';
  const baseUrl = repairDeskBaseUrl();
  if (!baseUrl) return '';
  return `${baseUrl}/index.php?r=ticket/view&id=${encodeURIComponent(internalTicketId)}`;
}

async function openRepairDeskTicket(url) {
  const targetUrl = String(url || '').trim();
  if (!targetUrl) return;
  if (window.desktopApp?.openExternalUrl) {
    await window.desktopApp.openExternalUrl(targetUrl);
    return;
  }
  window.open(targetUrl, '_blank', 'noopener,noreferrer');
}

function queueCardMarkup(ticket, fallbackStatus, staleClass) {
  const showAssignedTech = currentPreferences().display?.showAssignedTech !== false;
  const ticketUrl = repairDeskTicketUrl(ticket);
  const statusColor = sanitizeCssColor(ticket.statusColor || '#64748b', '#64748b');
  const priorityBadge = ticket.isRushJob
    ? '<span class="queue-flag rush">Priority</span>'
    : (ticket.isPriorityTicket ? '<span class="queue-flag priority">Priority</span>' : '');
  return `
    <article class="queue-item${staleClass ? ' ' + staleClass : ''}">
      <div class="queue-top">
        <div class="queue-top-main">
          ${ticketUrl
            ? `<button class="queue-ticket queue-ticket-link" type="button" data-ticket-url="${escapeHtml(ticketUrl)}" aria-label="Open RepairDesk ticket T-${escapeHtml(ticket.orderId)}">T-${escapeHtml(ticket.orderId)}</button>`
            : `<div class="queue-ticket">T-${escapeHtml(ticket.orderId)}</div>`}
          ${priorityBadge}
        </div>
        <div class="wait-box ${waitingToneClass(ticket.waitingDays)}">${waitingBadge(ticket.waitingDays, ticket.waitingHours)}</div>
      </div>
      <span class="status-box" data-status-color="${escapeHtml(statusColor)}">${escapeHtml(ticket.status || fallbackStatus)}</span>
      <div class="queue-info">
        <div class="queue-name-row">
          <div class="queue-name">${escapeHtml(ticket.customerName)}</div>
          <div class="queue-detail">${escapeHtml((ticket.devices && ticket.devices[0]) || 'General service')}</div>
          <div class="queue-service">${escapeHtml((ticket.issues && ticket.issues[0]) || 'No issue listed')}</div>
        </div>
      </div>
      ${showAssignedTech ? `<div class="queue-issue">${escapeHtml(ticket.assigneeName)}</div>` : ''}
    </article>
  `;
}

function sanitizeCssColor(value, fallback = '#64748b') {
  const color = String(value || '').trim();
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) return color;
  return fallback;
}

function applyStatusBoxColors(root = document) {
  root.querySelectorAll('[data-status-color]').forEach((element) => {
    element.style.backgroundColor = sanitizeCssColor(element.dataset.statusColor, '#64748b');
  });
}

function renderReadyQueue(data) {
  const filtered = filterColumnItems(data.readyQueue || [], data.uiPreferences?.columns?.readyToStart?.refurbMode, data.uiPreferences?.columns?.readyToStart?.refurbRotateSeconds);
  const items = filtered.items;
  qs('ready-count-pill').textContent = filtered.countLabel;
  if (!items.length) {
    qs('ready-queue-content').innerHTML = `
      <div class="state">
        <div>
          <h2 class="empty-title">No ready tickets</h2>
          <div class="empty-sub">Nothing is currently in a ready-to-start status.</div>
        </div>
      </div>
    `;
    return;
  }

  qs('ready-queue-content').innerHTML = `
    <div class="queue-list">
      ${items.slice(0, 14).map((ticket) => queueCardMarkup(ticket, 'Ready to Start', '')).join('')}
    </div>
  `;
}

function renderProgressQueue(data) {
  const filtered = filterColumnItems(data.inProgressQueue || [], data.uiPreferences?.columns?.inProgress?.refurbMode, data.uiPreferences?.columns?.inProgress?.refurbRotateSeconds);
  const items = filtered.items;
  qs('progress-count-pill').textContent = filtered.countLabel;
  if (!items.length) {
    qs('progress-queue-content').innerHTML = `
      <div class="state">
        <div>
          <h2 class="empty-title">No progress queue</h2>
          <div class="empty-sub">Nothing is currently in an in-progress status.</div>
        </div>
      </div>
    `;
    return;
  }

  qs('progress-queue-content').innerHTML = `
    <div class="queue-list">
      ${items.slice(0, 14).map((ticket) => queueCardMarkup(ticket, 'In Progress', pulseTimingEnabled(data.uiPreferences) && ticket.staleHours != null && ticket.staleHours >= ticket.staleThresholdHours ? 'stale' : '')).join('')}
    </div>
  `;
}

function renderAttentionQueue(data) {
  const filtered = filterColumnItems(data.needsAttentionQueue || [], data.uiPreferences?.columns?.needsAttention?.refurbMode, data.uiPreferences?.columns?.needsAttention?.refurbRotateSeconds);
  const items = filtered.items;
  qs('attention-count-pill').textContent = filtered.countLabel;
  if (!items.length) {
    qs('attention-queue-content').innerHTML = `
      <div class="state">
        <div>
          <h2 class="empty-title">No attention queue</h2>
          <div class="empty-sub">Nothing is currently in a needs-attention status.</div>
        </div>
      </div>
    `;
    return;
  }

  qs('attention-queue-content').innerHTML = `
    <div class="queue-list">
      ${items.slice(0, 14).map((ticket) => queueCardMarkup(ticket, 'Needs Attention', pulseTimingEnabled(data.uiPreferences) && ticket.staleHours != null && ticket.staleHours >= ticket.staleThresholdHours ? 'stale' : '')).join('')}
    </div>
  `;
}

function renderWaitingQueue(data) {
  const filtered = filterColumnItems(data.waitingQueue || [], data.uiPreferences?.columns?.waiting?.refurbMode, data.uiPreferences?.columns?.waiting?.refurbRotateSeconds);
  const items = filtered.items;
  qs('waiting-count-pill').textContent = filtered.countLabel;
  if (!items.length) {
    qs('waiting-queue-content').innerHTML = `
      <div class="state">
        <div>
          <h2 class="empty-title">No waiting queue</h2>
          <div class="empty-sub">Nothing is currently in a waiting status.</div>
        </div>
      </div>
    `;
    return;
  }

  qs('waiting-queue-content').innerHTML = `
    <div class="queue-list">
      ${items.slice(0, 14).map((ticket) => queueCardMarkup(ticket, 'Waiting', pulseTimingEnabled(data.uiPreferences) && ticket.staleHours != null && ticket.staleHours >= ticket.staleThresholdHours ? 'stale' : '')).join('')}
    </div>
  `;
}

function renderQualityControlQueue(data) {
  const filtered = filterColumnItems(data.qualityControlQueue || [], data.uiPreferences?.columns?.qualityControl?.refurbMode, data.uiPreferences?.columns?.qualityControl?.refurbRotateSeconds);
  const items = filtered.items;
  qs('qc-count-pill').textContent = filtered.countLabel;
  if (!items.length) {
    qs('qc-queue-content').innerHTML = `
      <div class="state">
        <div>
          <h2 class="empty-title">No QC queue</h2>
          <div class="empty-sub">Nothing is currently in quality control.</div>
        </div>
      </div>
    `;
    return;
  }

  qs('qc-queue-content').innerHTML = `
    <div class="queue-list">
      ${items.slice(0, 14).map((ticket) => queueCardMarkup(ticket, 'Quality Control', pulseTimingEnabled(data.uiPreferences) && ticket.staleHours != null && ticket.staleHours >= ticket.staleThresholdHours ? 'stale' : '')).join('')}
    </div>
  `;
}

function renderColumn6Queue(data) {
  const filtered = filterColumnItems(data.column6Queue || [], data.uiPreferences?.columns?.column6?.refurbMode, data.uiPreferences?.columns?.column6?.refurbRotateSeconds);
  const items = filtered.items;
  qs('column6-count-pill').textContent = filtered.countLabel;
  if (!items.length) {
    qs('column6-queue-content').innerHTML = `
      <div class="state">
        <div>
          <h2 class="empty-title">No column 6 tickets</h2>
          <div class="empty-sub">Nothing is currently in the extra column.</div>
        </div>
      </div>
    `;
    return;
  }

  qs('column6-queue-content').innerHTML = `
    <div class="queue-list">
      ${items.slice(0, 14).map((ticket) => queueCardMarkup(ticket, currentPreferences().columns?.column6?.label || 'Column 6', '')).join('')}
    </div>
  `;
}

function renderError(message) {
  clearCalendarRotationTimers();
  state.calendarRotationRunId += 1;
  state.calendarRotationConfigKey = '';
  state.calendarWeekOffset = 0;
  if (state.refurbRotationTimer) {
    clearInterval(state.refurbRotationTimer);
    state.refurbRotationTimer = null;
  }
  qs('summary').innerHTML = '';
  qs('status-row').innerHTML = '';
  qs('page-dots').innerHTML = '';
  const compact = useCompactTopbarSummaryLabels();
  qs('open-tickets-pill').textContent = compact ? 'Open 0' : 'Open Tickets 0';
  qs('oldest-regular-pill').textContent = compact ? 'Regular --' : 'Oldest Regular Ticket --';
  qs('oldest-priority-pill').textContent = compact ? 'Priority None' : 'Oldest Priority Ticket None';
  qs('refresh-countdown-pill').textContent = 'Refresh --s';
  qs('ready-count-pill').textContent = '0 tickets';
  qs('ready-queue-content').innerHTML = '';
  qs('progress-count-pill').textContent = '0 tickets';
  qs('progress-queue-content').innerHTML = '';
  qs('attention-count-pill').textContent = '0 tickets';
  qs('attention-queue-content').innerHTML = '';
  qs('waiting-count-pill').textContent = '0 tickets';
  qs('waiting-queue-content').innerHTML = '';
  qs('qc-count-pill').textContent = '0 tickets';
  qs('qc-queue-content').innerHTML = '';
  qs('column6-count-pill').textContent = '0 tickets';
  qs('column6-queue-content').innerHTML = '';
  qs('schedule-strip').innerHTML = '';
  qs('rush-sync-overlay').classList.remove('open');
  qs('footer-note').textContent = message;
}

function renderAll() {
  if (!state.data) return;
  state.savedPreferences = state.data.uiPreferences || state.savedPreferences;
  updateBrand(state.data.uiPreferences);
  applyAmbientAudioPreferences(state.data.uiPreferences);
  applyPreferenceLabels(state.data.uiPreferences);
  applyDisplayPreferences(state.data.uiPreferences);
  if (!state.settingsLoaded && !isSettingsOpen()) {
    fillSettingsForm(state.data.uiPreferences);
    state.settingsLoaded = true;
  }
  renderSummary(state.data);
  renderStatuses(state.data);
  qs('schedule-panel').hidden = state.data.uiPreferences?.schedule?.showCalendar === false;
  renderSchedule(state.data);
  renderBoard(state.data);
  renderReadyQueue(state.data);
  renderProgressQueue(state.data);
  renderAttentionQueue(state.data);
  renderWaitingQueue(state.data);
  renderQualityControlQueue(state.data);
  renderColumn6Queue(state.data);
  applyStatusBoxColors();
  setupRefurbRotation();
  renderRushSyncStatus(state.data.rushSync || {});
  renderSharedCalendarSyncStatus(state.data.calendarSync || {});
  renderRushSyncPopup(state.data.rushSync || {});
  qs('footer-note').textContent = state.data.displayTicketCounts
    ? 'RepairDesk count widgets are enabled for this token. This custom board still prioritizes full ticket cards.'
    : 'This board groups duplicate issue lines into a single readable ticket card for TV use.';
}

async function loadFeed() {
  const urlToken = String(params().get('token') || '').trim();
  const urlDisplayUrl = String(params().get('displayUrl') || '').trim();
  const config = await loadApiConfig().catch(() => null);
  if (!config && !urlDisplayUrl && !urlToken) {
    renderError('Could not load saved board settings yet. Please reopen the app in a moment.');
    return;
  }
  const displayUrl = urlDisplayUrl || String(config?.ticketCounterDisplayUrl || '').trim();
  if (!displayUrl && !urlToken) {
    renderError('Missing Ticket Counter Display URL. Add it in Settings or complete the welcome setup.');
    if (config) {
      maybeShowWelcome(config).catch(() => {});
    }
    return;
  }

  try {
    const requestParams = new URLSearchParams();
    if (displayUrl) requestParams.set('displayUrl', displayUrl);
    if (urlToken) requestParams.set('token', urlToken);
    const response = await apiFetch('/api/ticket-counter?' + requestParams.toString());
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Request failed');
    }
    state.data = payload;
    state.savedPreferences = payload.uiPreferences || state.savedPreferences;
    renderAll();
    setupPaging();
    setupRefresh();
    setupCalendarRotation();
    if (config) {
      maybeShowWelcome(config).catch(() => {});
    }
  } catch (error) {
    renderError(error.message || 'Could not load the RepairDesk ticket feed.');
  }
}

async function savePreferences() {
  if (state.settingsSaving) return;
  try {
    setSettingsSaving(true);
    qs('settings-status').textContent = 'Saving...';
    if (!state.data) {
      await loadSavedPreferences({ force: true });
    }
    const previousDisplay = currentPreferences().display || { fullscreen: false, orientation: 'auto', displayTarget: 'current' };
    state.logoDataUrl = await readSelectedLogo();
    state.sideMediaDataUrl = await readSelectedSideMedia();
    state.themeBackgroundDataUrl = await readSelectedThemeBackground();
    const ambientAudio = await readSelectedAmbientAudio();
    state.ambientAudioDataUrl = ambientAudio.audioDataUrl;
    state.ambientAudioFileName = ambientAudio.fileName;
    const nextPreferences = collectSettingsForm();
    await saveApiConfig();
    const response = await apiFetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextPreferences),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Could not save settings');
    }
    if (window.desktopApp?.refreshUpdateConfig) {
      const refreshedStatus = await window.desktopApp.refreshUpdateConfig();
      renderUpdateStatus(refreshedStatus || {});
    }
    await refreshConnectionHealthStatus();
    if (state.data) {
      state.data = {
        ...state.data,
        uiPreferences: payload.preferences,
      };
    }
    state.savedPreferences = payload.preferences;
    applyAmbientAudioPreferences(payload.preferences);
    qs('settings-status').textContent = 'Saved. Refreshing display...';
    const nextDisplay = payload.preferences.display || nextPreferences.display || {};
    const displayChanged = !!window.desktopApp?.applyWindowPreferences && (
      !!nextDisplay.fullscreen !== !!previousDisplay.fullscreen ||
      String(nextDisplay.orientation || 'auto') !== String(previousDisplay.orientation || 'auto') ||
      String(nextDisplay.displayTarget || 'current') !== String(previousDisplay.displayTarget || 'current')
    );
    if (displayChanged) {
      await window.desktopApp.applyWindowPreferences(payload.preferences.display || {});
    }
    await loadFeed();
    fillSettingsForm(payload.preferences);
    state.settingsLoaded = true;
    qs('settings-status').textContent = 'Saved.';
  } catch (error) {
    qs('settings-status').textContent = error.message || 'Could not save settings.';
  } finally {
    setSettingsSaving(false);
  }
}

async function restartServer() {
  const btn = qs('settings-restart');
  btn.disabled = true;
  qs('settings-status').textContent = 'Restarting server...';

  try {
    await apiFetch('/api/server/restart', { method: 'POST' });
  } catch (_) {
    // The current connection may drop while the old server exits.
  }

  let attempts = 0;
  const poll = async () => {
    attempts += 1;
    try {
      const response = await apiFetch('/api/config/status', { cache: 'no-store' });
      if (response.ok) {
        qs('settings-status').textContent = 'Server restarted.';
        btn.disabled = false;
        await loadFeed();
        return;
      }
    } catch (_) {}

    if (attempts >= 30) {
      qs('settings-status').textContent = 'Restart requested. Refresh if the page does not recover.';
      btn.disabled = false;
      return;
    }
    setTimeout(poll, 1000);
  };

  setTimeout(poll, 1000);
}

async function openInBrowser() {
  if (!window.desktopApp?.openInBrowser) {
    qs('settings-status').textContent = 'Open in Browser is only available in the desktop app.';
    return;
  }

  try {
    const result = await window.desktopApp.openInBrowser();
    qs('settings-status').textContent = result?.url ? `Opened ${result.url}` : 'Opened board in browser.';
  } catch (error) {
    qs('settings-status').textContent = error?.message || 'Could not open browser.';
  }
}

async function checkForUpdates() {
  const btn = qs('settings-check-updates');
  if (!window.desktopApp?.checkForUpdates) {
    qs('settings-status').textContent = 'Update checks are only available in the desktop app.';
    return;
  }

  btn.disabled = true;
  state.manualUpdatePopupUntil = Date.now() + (5 * 60 * 1000);
  qs('settings-status').textContent = 'Checking for updates...';

  try {
    const status = await window.desktopApp.checkForUpdates();
    renderUpdateStatus(status || {});
    renderUpdatePopup(status || {});
    qs('settings-status').textContent = status?.message || 'Update check finished.';
  } catch (error) {
    qs('settings-status').textContent = error?.message || 'Update check failed.';
  } finally {
    btn.disabled = false;
  }
}

async function installUpdateNow() {
  if (!window.desktopApp?.installUpdate) {
    qs('settings-status').textContent = 'Install Update is only available in the desktop app.';
    return;
  }
  try {
    const status = await window.desktopApp.installUpdate();
    renderUpdateStatus(status || {});
    qs('settings-status').textContent = status?.message || 'Installing update...';
  } catch (error) {
    qs('settings-status').textContent = error?.message || 'Could not install update.';
  }
}

async function skipCurrentUpdate() {
  const status = state.latestUpdateStatus || {};
  const version = String(status.version || '').trim();
  if (!version || !window.desktopApp?.skipUpdateVersion) {
    qs('update-overlay').classList.remove('open');
    return;
  }
  try {
    const nextStatus = await window.desktopApp.skipUpdateVersion(version);
    renderUpdateStatus(nextStatus || {});
    renderUpdatePopup(nextStatus || {});
    qs('settings-status').textContent = `Skipped update ${version}.`;
  } catch (error) {
    qs('settings-status').textContent = error?.message || 'Could not skip this update.';
  }
}

async function openFeatureRequest() {
  if (window.desktopApp?.openFeatureRequest) {
    try {
      const result = await window.desktopApp.openFeatureRequest();
      qs('settings-status').textContent = result?.bundlePath
        ? `Opened your email app and created a support bundle at ${result.bundlePath}`
        : 'Opened your email app for a feature request or bug report.';
      return;
    } catch (error) {
      qs('settings-status').textContent = error?.message || 'Could not open feature request / bug report email.';
      return;
    }
  }
  window.location.href = 'mailto:jeff@onebitetechnology.ca?subject=OBT%20Ticket%20Display%20Feature%20Request%20%2F%20Bug%20Report';
}

async function clearLocalData() {
  if (!window.desktopApp?.clearLocalData) {
    qs('settings-status').textContent = 'This option is only available in the desktop app.';
    return;
  }

  const confirmed = window.confirm('Remove all personal data and local files for this app on this computer? This will erase saved settings, API keys, ticket counter token, and cache files, then restart the app.');
  if (!confirmed) return;

  try {
    qs('settings-status').textContent = 'Removing local data and restarting...';
    await window.desktopApp.clearLocalData();
  } catch (error) {
    qs('settings-status').textContent = error?.message || 'Could not remove local data.';
  }
}

function closeSettings() {
  if (state.settingsSaving) return;
  state.settingsOpen = false;
  qs('settings-drawer').classList.remove('open');
  if (state.updateStatusTimer) {
    clearInterval(state.updateStatusTimer);
    state.updateStatusTimer = null;
  }
  resumeBoardRefreshAfterSettings();
}

function pauseBoardRefreshForSettings() {
  state.refreshPausedForSettings = true;
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
  if (state.refreshCountdownTimer) {
    clearInterval(state.refreshCountdownTimer);
    state.refreshCountdownTimer = null;
  }
  qs('refresh-countdown-pill').textContent = 'Refresh paused';
}

function resumeBoardRefreshAfterSettings() {
  if (!state.refreshPausedForSettings) return;
  state.refreshPausedForSettings = false;
  if (!state.data) return;
  setupRefresh();
  loadFeed();
}

function setupPaging() {
  if (state.pageTimer) clearInterval(state.pageTimer);
  const pages = totalPages();
  if (pages <= 1) return;
  state.pageTimer = setInterval(() => {
    state.page = (state.page + 1) % pages;
    renderBoard(state.data);
  }, DEFAULT_PAGE_SECONDS * 1000);
}

function setupRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  if (state.refreshCountdownTimer) clearInterval(state.refreshCountdownTimer);
  if (state.refreshPausedForSettings || isSettingsOpen()) {
    qs('refresh-countdown-pill').textContent = 'Refresh paused';
    return;
  }
  const minutes = Math.max(1, Number(state.data?.refreshMinutes || 1));
  const intervalMs = minutes * 60 * 1000;
  state.nextRefreshAt = Date.now() + intervalMs;
  const tick = () => {
    const remainingMs = Math.max(0, state.nextRefreshAt - Date.now());
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    qs('refresh-countdown-pill').textContent = 'Refresh ' + remainingSeconds + 's';
  };
  tick();
  state.refreshCountdownTimer = setInterval(tick, 1000);
  state.refreshTimer = setInterval(() => {
    state.nextRefreshAt = Date.now() + intervalMs;
    loadFeed();
  }, intervalMs);
}

function startClock() {
  if (state.clockTimer) clearInterval(state.clockTimer);
  const update = () => {
    qs('clock-pill').textContent = new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  };
  update();
  state.clockTimer = setInterval(update, 1000);
}

function startUpdatePromptPolling() {
  if (!window.desktopApp?.getUpdateStatus) return;
  if (state.updatePromptTimer) clearInterval(state.updatePromptTimer);
  refreshUpdateStatusAndPopup();
  state.updatePromptTimer = setInterval(refreshUpdateStatusAndPopup, 15000);
}

document.addEventListener('click', async (event) => {
  const trigger = event.target instanceof Element ? event.target.closest('[data-ticket-url]') : null;
  if (!trigger) return;
  event.preventDefault();
  const ticketUrl = String(trigger.getAttribute('data-ticket-url') || '').trim();
  if (!ticketUrl) return;
  try {
    await openRepairDeskTicket(ticketUrl);
  } catch (error) {
    qs('settings-status').textContent = error?.message || 'Could not open that RepairDesk ticket.';
  }
});

window.addEventListener('resize', () => {
  if (!state.data) return;
  applyDisplayPreferences(currentPreferences());
  updateBrand(currentPreferences());
  renderBoard(state.data);
  setupPaging();
  if (qs('settings-drawer')?.classList.contains('open')) {
    renderWindowDisplayLiveStatus();
  }
});

window.addEventListener('pointerdown', unlockAlertAudio, { passive: true });
window.addEventListener('keydown', unlockAlertAudio);
if (window.speechSynthesis && 'onvoiceschanged' in window.speechSynthesis) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    populateSpeechVoiceOptions(qs('pref-speech-voice')?.value || currentPreferences().schedule?.speechVoiceUri || '');
  });
}

qs('settings-open').addEventListener('click', openSettings);
qs('settings-close').addEventListener('click', closeSettings);
qs('settings-close-bottom').addEventListener('click', closeSettings);
qs('rush-sync-enabled').addEventListener('change', updateRushSyncFieldVisibility);
qs('pref-shared-calendar-mode').addEventListener('change', () => {
  updateSharedCalendarSyncFieldVisibility();
  if ((qs('pref-shared-calendar-mode')?.value || 'local') === 'follow' && !(state.discoveredSharedHosts || []).length) {
    discoverSharedStoreHosts();
  }
});
qs('pref-shared-calendar-board-name').addEventListener('input', updateSharedCalendarHostNote);
qs('pref-shared-calendar-host-url').addEventListener('input', updateSharedCalendarHostNote);
qs('shared-calendar-discover-hosts').addEventListener('click', discoverSharedStoreHosts);
qs('pref-shared-calendar-discovered-host').addEventListener('change', (event) => {
  const hostUrl = String(event.target?.value || '').trim();
  if (!hostUrl) return;
  qs('pref-shared-calendar-host-url').value = hostUrl;
  updateSharedCalendarHostNote();
  renderDiscoveredSharedHosts();
});
[
  'pref-shared-calendar-sync-calendar-blocks',
  'pref-shared-calendar-sync-appointments',
  'pref-shared-calendar-sync-brand',
  'pref-shared-calendar-sync-display',
  'pref-shared-calendar-sync-ticket-details',
  'pref-shared-calendar-sync-columns',
  'pref-shared-calendar-sync-updates',
].forEach((id) => {
  qs(id).addEventListener('change', () => renderSharedCalendarSyncStatus(state.data?.calendarSync || {}));
});
qs('pref-alert-audio-enabled').addEventListener('change', updateAppointmentAudioSettingsVisibility);
qs('pref-rotate-weeks').addEventListener('change', updateCalendarWeekModeVisibility);
qs('pref-stack-weeks').addEventListener('change', updateCalendarWeekModeVisibility);
qs('pref-pulse-timing-enabled').addEventListener('change', updatePulseTimingVisibility);
document.querySelectorAll('[data-sensitive-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const fieldId = button.dataset.sensitiveToggle;
    if (!fieldId) return;
    sensitiveFieldState[fieldId] = !sensitiveFieldState[fieldId];
    applySensitiveFieldMasking();
  });
});
['pref-fullscreen', 'pref-orientation', 'pref-display-target', 'pref-display-density'].forEach((id) => {
  qs(id).addEventListener('change', renderWindowDisplayLiveStatus);
});
qs('settings-open-browser').addEventListener('click', openInBrowser);
qs('settings-clear-data').addEventListener('click', clearLocalData);
qs('settings-check-updates').addEventListener('click', checkForUpdates);
qs('settings-install-update').addEventListener('click', installUpdateNow);
qs('update-popup-install').addEventListener('click', installUpdateNow);
qs('update-popup-skip').addEventListener('click', skipCurrentUpdate);
qs('rush-sync-popup-dismiss').addEventListener('click', () => {
  state.rushSyncDismissedKey = String(state.data?.rushSync?.alertKey || '');
  qs('rush-sync-overlay').classList.remove('open');
});
qs('rush-sync-popup-reconnect').addEventListener('click', () => {
  state.rushSyncDismissedKey = String(state.data?.rushSync?.alertKey || '');
  qs('rush-sync-overlay').classList.remove('open');
  openSettings();
});
qs('settings-feature-request').addEventListener('click', openFeatureRequest);
qs('settings-restart').addEventListener('click', restartServer);
qs('settings-save').addEventListener('click', savePreferences);
qs('welcome-save').addEventListener('click', saveWelcomeSetup);
qs('pref-add-alert-rule').addEventListener('click', () => {
  const rules = collectAlertAudioRules();
  rules.push(normalizeAlertAudioRule({ matchMode: 'service_contains', serviceMatcher: 'remote', leadMinutes: 30, cooldownSeconds: null, mode: 'speech', message: 'Remote appointment coming up soon' }));
  renderAlertAudioRules(rules);
  updateAlertRuleVisibility();
});
qs('pref-alert-rules').addEventListener('click', (event) => {
  if (!(event.target instanceof HTMLButtonElement)) return;
  if (event.target.matches('button[data-toggle-alert-rule]')) {
    const card = event.target.closest('.audio-rule-card');
    if (!card) return;
    card.classList.toggle('collapsed');
    event.target.textContent = card.classList.contains('collapsed') ? 'Edit' : 'Hide';
    return;
  }
  if (!event.target.matches('button[data-remove-alert-rule]')) return;
  const removeButton = event.target;
  const removeIndex = Number(removeButton.dataset.removeAlertRule);
  const rules = collectAlertAudioRules().filter((_, index) => index !== removeIndex);
  renderAlertAudioRules(rules);
  updateAlertRuleVisibility();
});
qs('pref-alert-rules').addEventListener('change', (event) => {
  if (event.target.matches('[data-alert-field="matchMode"]')) {
    updateAlertRuleVisibility();
  }
});
qs('pref-brand-logo').addEventListener('change', () => {
  const file = qs('pref-brand-logo').files && qs('pref-brand-logo').files[0];
  if (!file) {
    setLogoPreview(currentPreferences().brand?.logoDataUrl || '', currentPreferences().brand?.logoDataUrl ? 'Stored logo' : '');
    return;
  }
  readFileAsDataUrl(file, UPLOAD_RULES.logo, 'Could not read logo file').then((result) => {
    setLogoPreview(result, file.name);
  }).catch((error) => {
    qs('settings-status').textContent = error.message || 'Could not read logo file.';
    setLogoPreview(currentPreferences().brand?.logoDataUrl || '', currentPreferences().brand?.logoDataUrl ? 'Stored logo' : '');
  });
});
qs('pref-brand-logo-size').addEventListener('input', () => {
  applyLogoPreviewSize(qs('pref-brand-logo-size').value || 72);
});
qs('pref-brand-side-media').addEventListener('change', () => {
  const file = qs('pref-brand-side-media').files && qs('pref-brand-side-media').files[0];
  if (!file) {
    const existing = currentPreferences().brand?.sideMediaDataUrl || '';
    setSideMediaPreview(existing, existing ? `Stored ${detectSideMediaType(existing)}` : '');
    return;
  }
  readFileAsDataUrl(file, UPLOAD_RULES.sideMedia, 'Could not read side media file').then((result) => {
    const type = detectSideMediaType(result);
    setSideMediaPreview(result, `${type === 'video' ? 'Selected video' : 'Selected image'}: ${file.name}`);
  }).catch((error) => {
    qs('settings-status').textContent = error.message || 'Could not read side media file.';
    const existing = currentPreferences().brand?.sideMediaDataUrl || '';
    setSideMediaPreview(existing, existing ? `Stored ${detectSideMediaType(existing)}` : '');
  });
});
qs('pref-ambient-audio-file').addEventListener('change', () => {
  const file = qs('pref-ambient-audio-file').files && qs('pref-ambient-audio-file').files[0];
  if (!file) {
    const existing = currentPreferences().ambientAudio?.audioDataUrl || '';
    state.ambientAudioDataUrl = existing;
    state.ambientAudioFileName = currentPreferences().ambientAudio?.fileName || '';
    setAmbientAudioPreview(
      existing,
      currentPreferences().ambientAudio?.fileName || '',
      !!currentPreferences().ambientAudio?.enabled
    );
    return;
  }
  readFileAsDataUrl(file, UPLOAD_RULES.ambientAudio, 'Could not read ambient audio file').then((result) => {
    state.ambientAudioDataUrl = result;
    state.ambientAudioFileName = String(file.name || '').trim();
    setAmbientAudioPreview(result, `Selected audio: ${file.name}`, qs('pref-ambient-audio-enabled').checked);
  }).catch((error) => {
    qs('settings-status').textContent = error.message || 'Could not read ambient audio file.';
    const existing = currentPreferences().ambientAudio?.audioDataUrl || '';
    setAmbientAudioPreview(
      existing,
      currentPreferences().ambientAudio?.fileName || '',
      !!currentPreferences().ambientAudio?.enabled
    );
  });
});
qs('pref-ambient-audio-enabled').addEventListener('change', () => {
  setAmbientAudioPreview(
    state.ambientAudioDataUrl || currentPreferences().ambientAudio?.audioDataUrl || '',
    state.ambientAudioFileName || currentPreferences().ambientAudio?.fileName || '',
    qs('pref-ambient-audio-enabled').checked
  );
});
qs('pref-brand-background-image').addEventListener('change', () => {
  const file = qs('pref-brand-background-image').files && qs('pref-brand-background-image').files[0];
  if (!file) {
    const existing = currentPreferences().brand?.backgroundImageDataUrl || '';
    setThemeBackgroundPreview(existing, existing ? 'Stored background image' : '');
    return;
  }
  readFileAsDataUrl(file, UPLOAD_RULES.background, 'Could not read background image file').then((result) => {
    setThemeBackgroundPreview(result, file.name);
  }).catch((error) => {
    qs('settings-status').textContent = error.message || 'Could not read background image file.';
    const existing = currentPreferences().brand?.backgroundImageDataUrl || '';
    setThemeBackgroundPreview(existing, existing ? 'Stored background image' : '');
  });
});

reorderSettingsSections();
enhanceSettingsSections();
enhanceCollapsibleSubsections();
wireColorControls();
qs('page-title').textContent = pageTitle();
startClock();
startUpdatePromptPolling();
loadSavedPreferences().catch(() => {});
loadFeed();
