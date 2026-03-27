/**
 * One Bite Technology — RepairDesk Dashboard Server
 * Run: node server.js
 * Then open: http://localhost:3000
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 3000);
const APP_VERSION = 'v2.1.68-beta.44';
const RD_PUBLIC_BASE = 'https://api.repairdesk.co/api/web/v1';
const DEFAULT_API_KEY = '';
const LOOKBACK_DAYS = 90;
const DATA_DIR = process.env.APP_DATA_DIR || __dirname;
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const CATEGORY_RULES_PATH = path.join(DATA_DIR, 'category-rules.json');
const CONSIGNMENT_RULES_PATH = path.join(DATA_DIR, 'consignment-rules.json');
const INVOICE_DETAIL_CACHE_PATH = path.join(DATA_DIR, 'invoice-detail-cache.json');
const TICKET_META_CACHE_PATH = path.join(DATA_DIR, 'ticket-meta-cache.json');
const TICKET_META_CACHE_VERSION = 5;
const TICKET_META_CACHE_TTL_MS = 60 * 1000;
const RUSH_SYNC_CACHE_TTL_MS = 45 * 1000;
const RUSH_SYNC_MAX_PAGES = 10;
const DEFAULT_UI_PREFERENCES = {
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
  display: {
    fullscreen: false,
    orientation: 'auto',
    displayTarget: 'current',
    densityMode: 'auto',
    customerNameMode: 'first_name_only',
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
  schedule: {
    includedWeekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    blockedWeekdays: ['Monday'],
    temporaryBlockedDates: [],
    showCalendar: true,
    rotateWeeks: false,
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
  columns: {
    readyToStart: {
      label: 'Ready to start',
      visible: true,
      refurbMode: 'all',
      refurbRotateSeconds: 12,
      statuses: ['Ready to Start', 'Parts Arrived - Ready to Start', 'Pending - New', 'Pending - New (No Notifications)'],
    },
    inProgress: {
      label: 'In Progress',
      visible: true,
      refurbMode: 'all',
      refurbRotateSeconds: 12,
      statuses: ['In Progress', 'Diagnostics - In Progress'],
    },
    needsAttention: {
      label: 'Needs Attention',
      visible: true,
      refurbMode: 'all',
      refurbRotateSeconds: 12,
      statuses: ['Needs Estimate', 'Need to order Parts'],
    },
    waiting: {
      label: 'Waiting',
      visible: true,
      refurbMode: 'all',
      refurbRotateSeconds: 12,
      statuses: ['Waiting on Customer', 'Waiting for Parts'],
    },
    qualityControl: {
      label: 'Quality Control',
      visible: true,
      refurbMode: 'all',
      refurbRotateSeconds: 12,
      statuses: ['Quality Control'],
    },
    column6: {
      label: 'Column 6',
      visible: false,
      refurbMode: 'all',
      refurbRotateSeconds: 12,
      statuses: [],
    },
  },
};
const DEFAULT_CONSIGNMENT_RULES = {
  vendorKeywords: ['Vertex'],
  skuVendors: {},
  serialVendors: {
    MXL8412N94: 'Vertex Systems',
  },
};

const DEFAULT_CATEGORY_RULES = {
  exactCategoryBucket: {
    'iPhone Cases & Protection': 'retail',
    'iPad Cases & Protection': 'retail',
    'MacBook & Laptop Cases & Protection': 'retail',
    'iPhone - Camera Lens Protection': 'retail',
    Storage: 'retail',
    Software: 'retail',
    'Non-Inventory': 'retail',
    Monitors: 'devices',
    iPhone: 'devices',
    iPad: 'devices',
    iMac: 'devices',
    'Mac Mini': 'devices',
    'MacBook Air': 'devices',
    'MacBook Pro': 'devices',
    'Windows Laptops': 'devices',
    'Windows Desktops': 'devices',
  },
  displayTopLevelByCategory: {
    Monitors: 'Devices',
    iPhone: 'Devices',
    iPad: 'Devices',
    iMac: 'Devices',
    'Mac Mini': 'Devices',
    'MacBook Air': 'Devices',
    'MacBook Pro': 'Devices',
    'Windows Laptops': 'Devices',
    'Windows Desktops': 'Devices',
    'iPhone Cases & Protection': 'Accessories',
    'iPad Cases & Protection': 'Accessories',
    'MacBook & Laptop Cases & Protection': 'Accessories',
    'iPhone - Camera Lens Protection': 'Accessories',
    Storage: 'Accessories',
    Software: 'Non-Inventory',
  },
  deviceTopLevels: ['Devices'],
  retailTopLevels: ['Accessories', 'Non-Inventory', 'Non-Inventory Products'],
  retailCategoryPrefixes: [
    'Accessories',
    'Cases & Protection',
    'Chargers & Cables',
    'Computer Cleaning & Maintenance',
    'Gifts & Home',
    'Headphones & Audio',
    'iPhone Mounts & Other',
    'Keyboards & Mice',
    'Mobile Plans & SIM Cards',
    'Monitor & TV Mounts',
    'Networking Hardware',
    'Non-Inventory',
    'Power Bars & Surge Protectors',
    'Screen Protectors & Cleaning',
    'Smart Home & Security',
    'Storage',
    'Software',
    'Webcams',
    'iPad -',
    'iPhone -',
  ],
  deviceCategoryPrefixes: [
    'Devices',
    'Apple TV',
    'Apple Watch',
    'Chromebooks',
    'Clearance',
    'Consignment',
    'iMac',
    'iPad',
    'iPhone',
    'iPod',
    'Mac Mini',
    'MacBook Air',
    'MacBook Pro',
    'Monitors',
    'Windows Desktops',
    'Windows Laptops',
  ],
};

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      console.log('[CONFIG] Loaded saved tokens from config.json');
      const normalized = normalizeAppConfig(saved);
      if (Object.prototype.hasOwnProperty.call(saved, 'bearerToken') || Object.prototype.hasOwnProperty.call(saved, 'xTenant')) {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2), 'utf8');
        console.log('[CONFIG] Removed legacy bearer/xTenant keys from config.json');
      }
      return normalized;
    }
  } catch (e) {
    console.log('[CONFIG] Could not read config.json:', e.message);
  }
  return normalizeAppConfig({});
}

function normalizeStringArray(values, fallback) {
  if (!Array.isArray(values)) return [...fallback];
  const cleaned = values
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return cleaned.length ? cleaned : [...fallback];
}

function normalizeHexColor(value, fallback) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  return fallback;
}

function normalizePercent(value, fallback, min, max) {
  return Math.max(min, Math.min(max, Number(value ?? fallback) || fallback));
}

function normalizeColumnConfig(savedColumn, fallbackColumn) {
  const refurbMode = ['all', 'hide_refurbs', 'only_refurbs', 'rotate_refurbs'].includes(String(savedColumn?.refurbMode || '').toLowerCase())
    ? String(savedColumn.refurbMode).toLowerCase()
    : (['all', 'hide_refurbs', 'only_refurbs', 'rotate_refurbs'].includes(String(fallbackColumn?.refurbMode || '').toLowerCase())
      ? String(fallbackColumn.refurbMode).toLowerCase()
      : 'all');
  return {
    label: String(savedColumn?.label || fallbackColumn.label || '').trim() || fallbackColumn.label,
    visible: savedColumn?.visible !== undefined ? !!savedColumn.visible : fallbackColumn.visible !== false,
    statuses: normalizeStringArray(savedColumn?.statuses, fallbackColumn.statuses),
    refurbMode,
    refurbRotateSeconds: Math.max(
      5,
      Number(savedColumn?.refurbRotateSeconds ?? fallbackColumn?.refurbRotateSeconds ?? 12) || 12
    ),
  };
}

function normalizeDurationRule(savedRule, fallbackRule, legacyValue = null, legacyUnit = 'hours') {
  if (savedRule && typeof savedRule === 'object') {
    return {
      days: Math.max(0, Number(savedRule.days ?? fallbackRule.days) || 0),
      hours: Math.max(0, Number(savedRule.hours ?? fallbackRule.hours) || 0),
    };
  }
  if (legacyValue != null) {
    return {
      days: legacyUnit === 'days' ? Math.max(0, Number(legacyValue) || 0) : 0,
      hours: legacyUnit === 'hours' ? Math.max(0, Number(legacyValue) || 0) : 0,
    };
  }
  return { ...fallbackRule };
}

function normalizeAlertAudioRule(savedRule, fallbackRule = {}) {
  const legacyType = String(savedRule?.appointmentType || fallbackRule?.appointmentType || '').toLowerCase();
  const matchMode = ['any_service', 'service_contains'].includes(String(savedRule?.matchMode || '').toLowerCase())
    ? String(savedRule.matchMode).toLowerCase()
    : (['any_service', 'service_contains'].includes(String(fallbackRule?.matchMode || '').toLowerCase())
      ? String(fallbackRule.matchMode).toLowerCase()
      : (legacyType === 'service_match' || legacyType === 'on_site' ? 'service_contains' : 'any_service'));
  const mode = ['chime', 'speech', 'both'].includes(String(savedRule?.mode || '').toLowerCase())
    ? String(savedRule.mode).toLowerCase()
    : (['chime', 'speech', 'both'].includes(String(fallbackRule?.mode || '').toLowerCase())
      ? String(fallbackRule.mode).toLowerCase()
      : 'chime');
  const legacyMatcher = legacyType === 'on_site' ? 'onsite' : '';
  const matcher = String(savedRule?.serviceMatcher || fallbackRule?.serviceMatcher || legacyMatcher).trim();
  const defaultMessage = matcher ? `${matcher.charAt(0).toUpperCase()}${matcher.slice(1)} appointment coming up soon` : 'Appointment coming up soon';
  const cooldownRaw = savedRule?.cooldownSeconds ?? fallbackRule?.cooldownSeconds;
  const normalizedCooldown = cooldownRaw === '' || cooldownRaw == null
    ? null
    : Math.max(5, Number(cooldownRaw) || 0) || null;
  return {
    matchMode,
    leadMinutes: Math.max(0, Number(savedRule?.leadMinutes ?? fallbackRule?.leadMinutes ?? 45) || 45),
    cooldownSeconds: normalizedCooldown,
    mode,
    message: String(savedRule?.message || fallbackRule?.message || defaultMessage).trim() || defaultMessage,
    serviceMatcher: matcher,
  };
}

function defaultAlertAudioRulesFromLegacy(savedSchedule = {}) {
  return [
    normalizeAlertAudioRule({
      matchMode: 'service_contains',
      serviceMatcher: 'remote',
      leadMinutes: savedSchedule?.defaultLeadMinutes ?? DEFAULT_UI_PREFERENCES.schedule.defaultLeadMinutes,
      mode: savedSchedule?.alertAudioMode ?? 'chime',
      cooldownSeconds: savedSchedule?.alertAudioCooldownSeconds ?? null,
      message: savedSchedule?.alertAudioMessage || 'Remote appointment coming up soon',
    }),
    normalizeAlertAudioRule({
      matchMode: 'service_contains',
      serviceMatcher: 'onsite',
      leadMinutes: savedSchedule?.onsiteLeadMinutes ?? DEFAULT_UI_PREFERENCES.schedule.onsiteLeadMinutes,
      mode: savedSchedule?.alertAudioMode ?? 'both',
      cooldownSeconds: savedSchedule?.alertAudioCooldownSeconds ?? null,
      message: savedSchedule?.alertAudioMessage || 'On-site appointment coming up soon',
    }),
  ];
}

function normalizeUiPreferences(savedPrefs = {}) {
  return {
    brand: {
      title: String(savedPrefs?.brand?.title || DEFAULT_UI_PREFERENCES.brand.title).trim() || DEFAULT_UI_PREFERENCES.brand.title,
      logoDataUrl: String(savedPrefs?.brand?.logoDataUrl || '').trim(),
      logoSize: Math.max(36, Math.min(180, Number(savedPrefs?.brand?.logoSize ?? DEFAULT_UI_PREFERENCES.brand.logoSize) || DEFAULT_UI_PREFERENCES.brand.logoSize)),
      headerColor: normalizeHexColor(
        savedPrefs?.brand?.headerColor,
        DEFAULT_UI_PREFERENCES.brand.headerColor
      ),
      headerSize: normalizePercent(
        savedPrefs?.brand?.headerSize,
        DEFAULT_UI_PREFERENCES.brand.headerSize,
        26,
        72
      ),
      tickerEnabled: savedPrefs?.brand?.tickerEnabled !== undefined
        ? !!savedPrefs.brand.tickerEnabled
        : DEFAULT_UI_PREFERENCES.brand.tickerEnabled,
      tickerText: String(savedPrefs?.brand?.tickerText || '').trim(),
      tickerSpeedSeconds: Math.max(
        8,
        Math.min(
          120,
          Number(savedPrefs?.brand?.tickerSpeedSeconds ?? DEFAULT_UI_PREFERENCES.brand.tickerSpeedSeconds)
            || DEFAULT_UI_PREFERENCES.brand.tickerSpeedSeconds
        )
      ),
      tickerTextColor: normalizeHexColor(
        savedPrefs?.brand?.tickerTextColor,
        DEFAULT_UI_PREFERENCES.brand.tickerTextColor
      ),
      tickerFontSize: normalizePercent(
        savedPrefs?.brand?.tickerFontSize,
        DEFAULT_UI_PREFERENCES.brand.tickerFontSize,
        12,
        32
      ),
      sideMediaEnabled: savedPrefs?.brand?.sideMediaEnabled !== undefined
        ? !!savedPrefs.brand.sideMediaEnabled
        : DEFAULT_UI_PREFERENCES.brand.sideMediaEnabled,
      sideMediaDataUrl: String(savedPrefs?.brand?.sideMediaDataUrl || '').trim(),
      sideMediaWidthPercent: Math.max(
        20,
        Math.min(
          70,
          Number(savedPrefs?.brand?.sideMediaWidthPercent ?? DEFAULT_UI_PREFERENCES.brand.sideMediaWidthPercent)
            || DEFAULT_UI_PREFERENCES.brand.sideMediaWidthPercent
        )
      ),
      backgroundImageEnabled: savedPrefs?.brand?.backgroundImageEnabled !== undefined
        ? !!savedPrefs.brand.backgroundImageEnabled
        : DEFAULT_UI_PREFERENCES.brand.backgroundImageEnabled,
      backgroundImageDataUrl: String(savedPrefs?.brand?.backgroundImageDataUrl || '').trim(),
      backgroundImageOpacityPercent: normalizePercent(
        savedPrefs?.brand?.backgroundImageOpacityPercent,
        DEFAULT_UI_PREFERENCES.brand.backgroundImageOpacityPercent,
        0,
        100
      ),
      backgroundColorStart: normalizeHexColor(
        savedPrefs?.brand?.backgroundColorStart,
        DEFAULT_UI_PREFERENCES.brand.backgroundColorStart
      ),
      backgroundColorEnd: normalizeHexColor(
        savedPrefs?.brand?.backgroundColorEnd,
        DEFAULT_UI_PREFERENCES.brand.backgroundColorEnd
      ),
      textColor: normalizeHexColor(
        savedPrefs?.brand?.textColor,
        DEFAULT_UI_PREFERENCES.brand.textColor
      ),
      accentColor: normalizeHexColor(
        savedPrefs?.brand?.accentColor,
        DEFAULT_UI_PREFERENCES.brand.accentColor
      ),
      textScalePercent: normalizePercent(
        savedPrefs?.brand?.textScalePercent,
        DEFAULT_UI_PREFERENCES.brand.textScalePercent,
        85,
        130
      ),
    },
    display: {
      fullscreen: savedPrefs?.display?.fullscreen !== undefined
        ? !!savedPrefs.display.fullscreen
        : DEFAULT_UI_PREFERENCES.display.fullscreen,
      orientation: ['auto', 'horizontal', 'vertical'].includes(String(savedPrefs?.display?.orientation || '').toLowerCase())
        ? String(savedPrefs.display.orientation).toLowerCase()
        : DEFAULT_UI_PREFERENCES.display.orientation,
      displayTarget: String(savedPrefs?.display?.displayTarget || DEFAULT_UI_PREFERENCES.display.displayTarget).trim() || DEFAULT_UI_PREFERENCES.display.displayTarget,
      densityMode: ['auto', 'compact', 'extra_compact'].includes(String(savedPrefs?.display?.densityMode || '').toLowerCase())
        ? String(savedPrefs.display.densityMode).toLowerCase()
        : DEFAULT_UI_PREFERENCES.display.densityMode,
      customerNameMode: ['full_name', 'first_name_only', 'hide'].includes(String(savedPrefs?.display?.customerNameMode || '').toLowerCase())
        ? String(savedPrefs.display.customerNameMode).toLowerCase()
        : DEFAULT_UI_PREFERENCES.display.customerNameMode,
      showAssignedTech: savedPrefs?.display?.showAssignedTech !== undefined
        ? !!savedPrefs.display.showAssignedTech
        : DEFAULT_UI_PREFERENCES.display.showAssignedTech,
      hideRefurbs: savedPrefs?.display?.hideRefurbs !== undefined
        ? !!savedPrefs.display.hideRefurbs
        : DEFAULT_UI_PREFERENCES.display.hideRefurbs,
      assigneeFilter: normalizeStringArray(savedPrefs?.display?.assigneeFilter, DEFAULT_UI_PREFERENCES.display.assigneeFilter),
      pulseTimingEnabled: savedPrefs?.display?.pulseTimingEnabled !== undefined
        ? !!savedPrefs.display.pulseTimingEnabled
        : DEFAULT_UI_PREFERENCES.display.pulseTimingEnabled,
      pinPriorityTickets: savedPrefs?.display?.pinPriorityTickets !== undefined
        ? !!savedPrefs.display.pinPriorityTickets
        : DEFAULT_UI_PREFERENCES.display.pinPriorityTickets,
      priorityStrobeEnabled: savedPrefs?.display?.priorityStrobeEnabled !== undefined
        ? !!savedPrefs.display.priorityStrobeEnabled
        : DEFAULT_UI_PREFERENCES.display.priorityStrobeEnabled,
      priorityStrobeIntensity: ['subtle', 'medium', 'intense'].includes(String(savedPrefs?.display?.priorityStrobeIntensity || '').toLowerCase())
        ? String(savedPrefs.display.priorityStrobeIntensity).toLowerCase()
        : DEFAULT_UI_PREFERENCES.display.priorityStrobeIntensity,
    },
    updates: {
      receiveBetaUpdates: savedPrefs?.updates?.receiveBetaUpdates !== undefined
        ? !!savedPrefs.updates.receiveBetaUpdates
        : DEFAULT_UI_PREFERENCES.updates.receiveBetaUpdates,
    },
    schedule: {
      includedWeekdays: normalizeStringArray(savedPrefs?.schedule?.includedWeekdays, DEFAULT_UI_PREFERENCES.schedule.includedWeekdays),
      blockedWeekdays: normalizeStringArray(savedPrefs?.schedule?.blockedWeekdays, DEFAULT_UI_PREFERENCES.schedule.blockedWeekdays),
      temporaryBlockedDates: normalizeStringArray(savedPrefs?.schedule?.temporaryBlockedDates, DEFAULT_UI_PREFERENCES.schedule.temporaryBlockedDates),
      showCalendar: savedPrefs?.schedule?.showCalendar !== undefined ? !!savedPrefs.schedule.showCalendar : DEFAULT_UI_PREFERENCES.schedule.showCalendar,
      rotateWeeks: savedPrefs?.schedule?.rotateWeeks !== undefined ? !!savedPrefs.schedule.rotateWeeks : DEFAULT_UI_PREFERENCES.schedule.rotateWeeks,
      currentWeekDurationSeconds: Math.max(
        5,
        Number(savedPrefs?.schedule?.currentWeekDurationSeconds ?? savedPrefs?.schedule?.rotateIntervalSeconds ?? DEFAULT_UI_PREFERENCES.schedule.currentWeekDurationSeconds)
          || DEFAULT_UI_PREFERENCES.schedule.currentWeekDurationSeconds
      ),
      nextWeekDurationSeconds: Math.max(
        5,
        Number(savedPrefs?.schedule?.nextWeekDurationSeconds ?? savedPrefs?.schedule?.rotateIntervalSeconds ?? DEFAULT_UI_PREFERENCES.schedule.nextWeekDurationSeconds)
          || DEFAULT_UI_PREFERENCES.schedule.nextWeekDurationSeconds
      ),
      dimPastDays: savedPrefs?.schedule?.dimPastDays !== undefined ? !!savedPrefs.schedule.dimPastDays : DEFAULT_UI_PREFERENCES.schedule.dimPastDays,
      defaultLeadMinutes: Math.max(0, Number(savedPrefs?.schedule?.defaultLeadMinutes ?? DEFAULT_UI_PREFERENCES.schedule.defaultLeadMinutes) || DEFAULT_UI_PREFERENCES.schedule.defaultLeadMinutes),
      onsiteLeadMinutes: Math.max(0, Number(savedPrefs?.schedule?.onsiteLeadMinutes ?? DEFAULT_UI_PREFERENCES.schedule.onsiteLeadMinutes) || DEFAULT_UI_PREFERENCES.schedule.onsiteLeadMinutes),
      imminentMinutes: Math.max(0, Number(savedPrefs?.schedule?.imminentMinutes ?? DEFAULT_UI_PREFERENCES.schedule.imminentMinutes) || DEFAULT_UI_PREFERENCES.schedule.imminentMinutes),
      speechVoiceUri: String(savedPrefs?.schedule?.speechVoiceUri || '').trim(),
      alertAudioEnabled: savedPrefs?.schedule?.alertAudioEnabled !== undefined
        ? !!savedPrefs.schedule.alertAudioEnabled
        : DEFAULT_UI_PREFERENCES.schedule.alertAudioEnabled,
      alertAudioRules: (Array.isArray(savedPrefs?.schedule?.alertAudioRules) && savedPrefs.schedule.alertAudioRules.length
        ? savedPrefs.schedule.alertAudioRules
        : defaultAlertAudioRulesFromLegacy(savedPrefs?.schedule))
        .map((rule, index) => normalizeAlertAudioRule({
          ...rule,
          cooldownSeconds: rule?.cooldownSeconds ?? savedPrefs?.schedule?.alertAudioCooldownSeconds ?? null,
        }, DEFAULT_UI_PREFERENCES.schedule.alertAudioRules[index] || {}))
        .filter((rule) => rule.leadMinutes >= 0),
    },
    staleRules: {
      inProgress: normalizeDurationRule(savedPrefs?.staleRules?.inProgress, DEFAULT_UI_PREFERENCES.staleRules.inProgress, savedPrefs?.staleRules?.inProgressHours, 'hours'),
      needsAttention: normalizeDurationRule(savedPrefs?.staleRules?.needsAttention, DEFAULT_UI_PREFERENCES.staleRules.needsAttention, savedPrefs?.staleRules?.needsAttentionDays, 'days'),
      waitingOnCustomer: normalizeDurationRule(savedPrefs?.staleRules?.waitingOnCustomer, DEFAULT_UI_PREFERENCES.staleRules.waitingOnCustomer, savedPrefs?.staleRules?.waitingOnCustomerDays, 'days'),
      waitingForParts: normalizeDurationRule(savedPrefs?.staleRules?.waitingForParts, DEFAULT_UI_PREFERENCES.staleRules.waitingForParts, savedPrefs?.staleRules?.waitingForPartsDays, 'days'),
      qualityControl: normalizeDurationRule(savedPrefs?.staleRules?.qualityControl, DEFAULT_UI_PREFERENCES.staleRules.qualityControl, savedPrefs?.staleRules?.qualityControlHours, 'hours'),
    },
    columns: {
      readyToStart: normalizeColumnConfig(savedPrefs?.columns?.readyToStart, DEFAULT_UI_PREFERENCES.columns.readyToStart),
      inProgress: normalizeColumnConfig(savedPrefs?.columns?.inProgress, DEFAULT_UI_PREFERENCES.columns.inProgress),
      needsAttention: normalizeColumnConfig(savedPrefs?.columns?.needsAttention, DEFAULT_UI_PREFERENCES.columns.needsAttention),
      waiting: normalizeColumnConfig(savedPrefs?.columns?.waiting, DEFAULT_UI_PREFERENCES.columns.waiting),
      qualityControl: normalizeColumnConfig(savedPrefs?.columns?.qualityControl, DEFAULT_UI_PREFERENCES.columns.qualityControl),
      column6: normalizeColumnConfig(savedPrefs?.columns?.column6, DEFAULT_UI_PREFERENCES.columns.column6),
    },
  };
}

function normalizeAppConfig(saved = {}) {
  return {
    apiKey: String(saved?.apiKey || '').trim(),
    ticketCounterDisplayUrl: String(saved?.ticketCounterDisplayUrl || '').trim(),
    ticketCounterToken: String(saved?.ticketCounterToken || '').trim(),
    rushSync: {
      enabled: saved?.rushSync?.enabled !== undefined ? !!saved.rushSync.enabled : false,
      cookie: normalizeRushSyncCookie(saved?.rushSync?.cookie || ''),
    },
    uiPreferences: normalizeUiPreferences(saved?.uiPreferences || {}),
  };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    console.log('[CONFIG] Tokens saved to config.json');
  } catch (e) {
    console.log('[CONFIG] Could not save config.json:', e.message);
  }
}

function getConfiguredApiKey() {
  return String(sessionConfig?.apiKey || '').trim();
}

function parseTicketCounterDisplayUrl(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { displayUrl: '', apiBase: '', token: '' };

  try {
    const parsed = new URL(raw);
    const token = String(parsed.searchParams.get('token') || '').trim();
    return {
      displayUrl: parsed.toString(),
      apiBase: `${parsed.protocol}//${parsed.host}/web/api/v1`,
      token,
    };
  } catch (_) {
    return { displayUrl: '', apiBase: '', token: '' };
  }
}

function normalizeRushSyncCookie(rawValue) {
  return String(rawValue || '')
    .replace(/^cookie\s*:\s*/i, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('; ')
    .trim();
}

function getRushSyncOrigin(rawDisplayUrl = '') {
  const parsed = parseTicketCounterDisplayUrl(rawDisplayUrl);
  if (!parsed.displayUrl) return '';
  try {
    const url = new URL(parsed.displayUrl);
    return `${url.protocol}//${url.host}`;
  } catch (_) {
    return '';
  }
}

function emptyRushSyncStatus(overrides = {}) {
  return {
    enabled: false,
    configured: false,
    connected: false,
    usingFallback: true,
    lastCheckedAt: null,
    lastError: '',
    ticketCount: 0,
    rushCount: 0,
    alertKey: '',
    ...overrides,
  };
}

function extractRushSyncListingRows(raw) {
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.data?.data)) return raw.data.data;
  return [];
}

function getTicketCounterConnection() {
  const fromUrl = parseTicketCounterDisplayUrl(sessionConfig?.ticketCounterDisplayUrl);
  if (fromUrl.apiBase && fromUrl.token) return fromUrl;
  return {
    displayUrl: '',
    apiBase: '',
    token: String(sessionConfig?.ticketCounterToken || '').trim(),
  };
}

let sessionConfig = loadConfig();
let rushSyncCache = {
  fetchedAt: 0,
  origin: '',
  cookie: '',
  map: Object.create(null),
  status: emptyRushSyncStatus(),
};

function restartServerProcess() {
  try {
    saveConfig(sessionConfig);
    saveInvoiceDetailCache();
    saveTicketMetaCache();

    const serverEntry = process.argv[1] || path.join(__dirname, 'server.js');
    const child = spawn('/bin/sh', ['-c', `sleep 1; "${process.execPath}" "${serverEntry}"`], {
      cwd: path.dirname(serverEntry),
      env: {
        ...process.env,
        PORT: String(PORT),
        APP_DATA_DIR: DATA_DIR,
        ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE || '1',
      },
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    console.log(`[SERVER] Spawned replacement process pid=${child.pid} port=${PORT}`);

    setTimeout(() => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1500);
    }, 250);
    return true;
  } catch (error) {
    console.log('[SERVER] Restart failed:', error.message);
    return false;
  }
}

function loadCategoryRules() {
  try {
    if (!fs.existsSync(CATEGORY_RULES_PATH)) {
      return DEFAULT_CATEGORY_RULES;
    }
    const saved = JSON.parse(fs.readFileSync(CATEGORY_RULES_PATH, 'utf8'));
    return {
      exactCategoryBucket: saved?.exactCategoryBucket && typeof saved.exactCategoryBucket === 'object'
        ? saved.exactCategoryBucket
        : DEFAULT_CATEGORY_RULES.exactCategoryBucket,
      displayTopLevelByCategory: saved?.displayTopLevelByCategory && typeof saved.displayTopLevelByCategory === 'object'
        ? saved.displayTopLevelByCategory
        : DEFAULT_CATEGORY_RULES.displayTopLevelByCategory,
      deviceTopLevels: Array.isArray(saved?.deviceTopLevels) ? saved.deviceTopLevels : DEFAULT_CATEGORY_RULES.deviceTopLevels,
      retailTopLevels: Array.isArray(saved?.retailTopLevels) ? saved.retailTopLevels : DEFAULT_CATEGORY_RULES.retailTopLevels,
      retailCategoryPrefixes: Array.isArray(saved?.retailCategoryPrefixes) ? saved.retailCategoryPrefixes : DEFAULT_CATEGORY_RULES.retailCategoryPrefixes,
      deviceCategoryPrefixes: Array.isArray(saved?.deviceCategoryPrefixes) ? saved.deviceCategoryPrefixes : DEFAULT_CATEGORY_RULES.deviceCategoryPrefixes,
    };
  } catch (e) {
    console.log('[CONFIG] Could not read category-rules.json:', e.message);
    return DEFAULT_CATEGORY_RULES;
  }
}

const categoryRules = loadCategoryRules();
const consignmentRules = loadConsignmentRules();

const ticketDetailCacheByInternalId = Object.create(null);
const ticketDetailCacheByOrderId = Object.create(null);
const ticketLookupCacheByOrderId = Object.create(null);
const invoiceDetailCacheById = loadInvoiceDetailCache();
const ticketMetaCacheByOrderId = loadTicketMetaCache();
const inventoryCacheBySku = Object.create(null);
const inventoryCacheById = Object.create(null);

function shouldCacheInvoiceDetail(detail) {
  const summary = detail?.summary || {};
  const status = String(summary.status || '').toLowerCase();
  const amountDue = parseMoney(summary.amount_due || 0);
  return status === 'paid' && amountDue <= 0;
}

function sanitizeInvoiceDetailForCache(detail) {
  if (!detail || typeof detail !== 'object') return null;
  const clone = JSON.parse(JSON.stringify(detail));
  if (clone?.summary?.signature && typeof clone.summary.signature === 'object') {
    delete clone.summary.signature.data;
  }
  return clone;
}

function loadInvoiceDetailCache() {
  try {
    if (!fs.existsSync(INVOICE_DETAIL_CACHE_PATH)) {
      return Object.create(null);
    }
    const saved = JSON.parse(fs.readFileSync(INVOICE_DETAIL_CACHE_PATH, 'utf8'));
    if (!saved || typeof saved !== 'object') {
      return Object.create(null);
    }
    const filtered = Object.create(null);
    for (const [invoiceId, detail] of Object.entries(saved)) {
      if (shouldCacheInvoiceDetail(detail)) {
        filtered[invoiceId] = detail;
      }
    }
    if (Object.keys(filtered).length !== Object.keys(saved).length) {
      fs.writeFileSync(INVOICE_DETAIL_CACHE_PATH, JSON.stringify(filtered, null, 2), 'utf8');
      console.log(`[CACHE] Pruned ${Object.keys(saved).length - Object.keys(filtered).length} unpaid invoice details from disk cache`);
    }
    console.log(`[CACHE] Loaded ${Object.keys(filtered).length} paid invoice details from disk`);
    return filtered;
  } catch (e) {
    console.log('[CACHE] Could not read invoice-detail-cache.json:', e.message);
    return Object.create(null);
  }
}

function saveInvoiceDetailCache() {
  try {
    fs.writeFileSync(INVOICE_DETAIL_CACHE_PATH, JSON.stringify(invoiceDetailCacheById, null, 2), 'utf8');
  } catch (e) {
    console.log('[CACHE] Could not save invoice-detail-cache.json:', e.message);
  }
}

function loadTicketMetaCache() {
  try {
    if (!fs.existsSync(TICKET_META_CACHE_PATH)) {
      return Object.create(null);
    }
    const saved = JSON.parse(fs.readFileSync(TICKET_META_CACHE_PATH, 'utf8'));
    if (!saved || typeof saved !== 'object') {
      return Object.create(null);
    }
    console.log(`[CACHE] Loaded ${Object.keys(saved).length} ticket meta rows from disk`);
    return saved;
  } catch (e) {
    console.log('[CACHE] Could not read ticket-meta-cache.json:', e.message);
    return Object.create(null);
  }
}

function saveTicketMetaCache() {
  try {
    fs.writeFileSync(TICKET_META_CACHE_PATH, JSON.stringify(ticketMetaCacheByOrderId, null, 2), 'utf8');
  } catch (e) {
    console.log('[CACHE] Could not save ticket-meta-cache.json:', e.message);
  }
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    return cleaned ? Number(cleaned) || 0 : 0;
  }
  return 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escJson(value) {
  return JSON.stringify(value);
}

function parseJsonSafe(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTimer(label) {
  const startedAt = Date.now();
  let lastAt = startedAt;
  return {
    phase(phaseLabel, extra = '') {
      const now = Date.now();
      const phaseMs = now - lastAt;
      const totalMs = now - startedAt;
      console.log(`[${label}] ${phaseLabel} +${phaseMs}ms total=${totalMs}ms${extra ? ` ${extra}` : ''}`);
      lastAt = now;
    },
    done(extra = '') {
      const totalMs = Date.now() - startedAt;
      console.log(`[${label}] done total=${totalMs}ms${extra ? ` ${extra}` : ''}`);
      return totalMs;
    },
  };
}

function dateToUnixStart(isoDate) {
  return Math.floor(new Date(`${isoDate}T00:00:00`).getTime() / 1000);
}

function dateToUnixEnd(isoDate) {
  return Math.floor(new Date(`${isoDate}T23:59:59`).getTime() / 1000);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function fetchJson(fullUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    console.log(`[HTTP] GET ${fullUrl}`);
    const req = https.get(fullUrl, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`[HTTP] ${res.statusCode}`);
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

function rdWeb(baseOrigin, endpoint, params = {}, cookie = '') {
  const origin = String(baseOrigin || '').trim();
  const normalizedCookie = normalizeRushSyncCookie(cookie);
  if (!origin || !normalizedCookie) {
    throw new Error('RepairDesk rush sync is missing a base URL or cookie');
  }
  const queryParams = new URLSearchParams(params);
  const fullUrl = `${origin}/web/api/v1/${endpoint}?${queryParams.toString()}`;
  return fetchJson(fullUrl, {
    Accept: 'application/json, text/plain, */*',
    Cookie: normalizedCookie,
    Referer: `${origin}/index.php?r=ticket/index`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  });
}

function rdPublic(endpoint, params = {}) {
  const apiKey = getConfiguredApiKey();
  if (!apiKey) {
    throw new Error('RepairDesk API key is not configured');
  }
  const queryParams = new URLSearchParams({ api_key: apiKey, ...params });
  const fullUrl = `${RD_PUBLIC_BASE}/${endpoint}?${queryParams.toString()}`;
  return fetchJson(fullUrl, {
    Accept: 'application/json',
    'User-Agent': 'OneBiteTech-RepairDeskDashboard/2.0',
  });
}

function rdTicketCounter(apiBase, endpoint, params = {}) {
  if (!apiBase) {
    throw new Error('RepairDesk Ticket Counter Display URL is not configured');
  }
  const queryParams = new URLSearchParams(params);
  const fullUrl = `${apiBase}/${endpoint}?${queryParams.toString()}`;
  return fetchJson(fullUrl, {
    Accept: 'application/json',
    Authorization: 'Bear :)',
    'User-Agent': 'OneBiteTech-TicketCounter/1.0',
  });
}

async function fetchAllTicketCounterPages(apiBase, endpoint, params = {}, maxPages = 20) {
  const combinedRows = [];
  let firstPagePayload = null;
  let previousSignature = '';
  const pagesFetched = [];

  for (let page = 0; page < maxPages; page += 1) {
    const response = await rdTicketCounter(apiBase, endpoint, { ...params, page, pagesize: 100 });
    const raw = parseJsonSafe(response.body);
    if (!raw || response.status !== 200 || Number(raw.status) !== 1) {
      throw new Error(`RepairDesk ticket counter ${endpoint} request failed`);
    }

    if (!firstPagePayload) {
      firstPagePayload = raw;
    }
    pagesFetched.push(page);

    const pageRows = Array.isArray(raw?.data?.pagination?.data) ? raw.data.pagination.data : [];
    const pageSignature = JSON.stringify(pageRows.map((ticket) => [
      String(ticket?.order_id || '').trim(),
      String(ticket?.status || '').trim(),
      String(ticket?.due_on || '').trim(),
      String(ticket?.device_issue || '').trim(),
      String(ticket?.device || '').trim(),
    ]));

    if (page > 0 && pageSignature && pageSignature === previousSignature) {
      break;
    }
    previousSignature = pageSignature;
    combinedRows.push(...pageRows);

    if (!raw?.data?.pagination?.next_page_exist || !pageRows.length) {
      break;
    }
  }

  if (!firstPagePayload) {
    throw new Error(`RepairDesk ticket counter ${endpoint} request failed`);
  }

  return {
    ...firstPagePayload,
    _fetchDebug: {
      pagesFetched,
      totalRows: combinedRows.length,
      endpoint,
    },
    data: {
      ...(firstPagePayload.data || {}),
      pagination: {
        ...(firstPagePayload.data?.pagination || {}),
        data: combinedRows,
      },
    },
  };
}

async function fetchPaginated(endpoint, params, extractItems, maxPages = 10) {
  const items = [];
  for (let page = 0; page < maxPages; page += 1) {
    const response = await rdPublic(endpoint, { ...params, pagesize: 100, page });
    const raw = parseJsonSafe(response.body);
    if (!raw || response.status !== 200) {
      throw new Error(`RepairDesk returned ${response.status} for ${endpoint}`);
    }
    items.push(...extractItems(raw));
    if (!raw.data?.pagination?.next_page_exist) break;
  }
  return items;
}

function mergeSyntheticTicketRowsIntoPayload(ticketsRaw, syntheticRows = []) {
  if (!Array.isArray(syntheticRows) || !syntheticRows.length) return ticketsRaw;
  const existingRows = Array.isArray(ticketsRaw?.data?.pagination?.data) ? ticketsRaw.data.pagination.data : [];
  if (!existingRows.length) {
    return {
      ...(ticketsRaw || {}),
      data: {
        ...(ticketsRaw?.data || {}),
        pagination: {
          ...(ticketsRaw?.data?.pagination || {}),
          data: syntheticRows,
        },
      },
    };
  }
  return {
    ...ticketsRaw,
    data: {
      ...(ticketsRaw.data || {}),
      pagination: {
        ...(ticketsRaw.data?.pagination || {}),
        data: [...existingRows, ...syntheticRows],
      },
    },
  };
}

function isValidTicketDetail(td) {
  return !!(td && typeof td === 'object' && td.summary && (td.summary.id || td.summary.order_id));
}

function isValidInvoiceDetail(detail) {
  return !!(detail && typeof detail === 'object' && detail.summary && detail.summary.id);
}

async function fetchTicketDetailRobust(ticketId, ticketNumHint = '', options = {}) {
  const forceFresh = !!options.forceFresh;
  const ticketKey = String(ticketId || '');
  const orderKey = String(ticketNumHint || '');
  const cachedByTicketId = ticketKey ? ticketDetailCacheByInternalId[ticketKey] : null;
  const cachedByOrderId = orderKey ? ticketDetailCacheByOrderId[orderKey] : null;
  if (!forceFresh && cachedByTicketId) return cachedByTicketId;
  if (!forceFresh && cachedByOrderId) return cachedByOrderId;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await rdPublic(`tickets/${ticketId}`);
    const raw = parseJsonSafe(response.body);
    const detail = raw?.data || null;
    if (response.status === 200 && isValidTicketDetail(detail)) {
      const internalId = String(detail.summary.id || ticketId || '');
      const orderId = String(detail.summary.order_id || ticketNumHint || '');
      if (internalId) ticketDetailCacheByInternalId[internalId] = detail;
      if (orderId) ticketDetailCacheByOrderId[orderId] = detail;
      return detail;
    }
    console.log(`[TICKET] Invalid detail for id=${ticketId} ticketNum=${ticketNumHint} attempt=${attempt}`);
    await sleep(250 * attempt);
  }

  if (ticketNumHint) {
    try {
      const searchResponse = await rdPublic('tickets', { keyword: ticketNumHint, pagesize: 10, page: 0 });
      const searchRaw = parseJsonSafe(searchResponse.body);
      const matches = searchRaw?.data?.ticketData || [];
      const match = matches.find((ticket) => String(ticket?.summary?.order_id || '') === String(ticketNumHint));
      const fallbackId = match?.summary?.id;
      if (fallbackId && String(fallbackId) !== String(ticketId)) {
        return fetchTicketDetailRobust(fallbackId, ticketNumHint, options);
      }
    } catch (e) {
      console.log(`[TICKET] Fallback search failed for ticket=${ticketNumHint}: ${e.message}`);
    }
  }

  return cachedByTicketId || cachedByOrderId || null;
}

async function fetchInvoiceDetail(invoiceId) {
  const key = String(invoiceId || '');
  if (!key) return null;
  if (invoiceDetailCacheById[key]) return invoiceDetailCacheById[key];

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await rdPublic(`invoices/${invoiceId}`);
    const raw = parseJsonSafe(response.body);
    const detail = raw?.data || null;
    if (response.status === 200 && isValidInvoiceDetail(detail)) {
      if (shouldCacheInvoiceDetail(detail)) {
        const cachedDetail = sanitizeInvoiceDetailForCache(detail);
        invoiceDetailCacheById[key] = cachedDetail;
        saveInvoiceDetailCache();
        return cachedDetail;
      }
      return detail;
    }
    console.log(`[INVOICE] Invalid detail for id=${invoiceId} attempt=${attempt}`);
    await sleep(250 * attempt);
  }

  return null;
}

async function fetchTicketLookupByOrderId(orderId, options = {}) {
  const forceFresh = !!options.forceFresh;
  const key = String(orderId || '').trim();
  if (!key) return null;
  const cachedLookup = ticketLookupCacheByOrderId[key] || null;
  if (!forceFresh && cachedLookup) return cachedLookup;

  const response = await rdPublic('tickets', { keyword: key, pagesize: 10, page: 0 });
  const raw = parseJsonSafe(response.body);
  if (!raw || response.status !== 200) {
    return null;
  }

  const matches = Array.isArray(raw?.data?.ticketData) ? raw.data.ticketData : [];
  const match = matches.find((ticket) => String(ticket?.summary?.order_id || '') === key) || null;
  if (match) {
    ticketLookupCacheByOrderId[key] = match;
    return match;
  }
  return cachedLookup;
}

async function fetchTicketMetaByOrderId(orderId, options = {}) {
  const forceFresh = !!options.forceFresh;
  const key = String(orderId || '').trim();
  if (!key) return emptyTicketMeta();
  if (
    !forceFresh &&
    ticketMetaCacheByOrderId[key] &&
    typeof ticketMetaCacheByOrderId[key] === 'object' &&
    Object.prototype.hasOwnProperty.call(ticketMetaCacheByOrderId[key], 'serviceName') &&
    Object.prototype.hasOwnProperty.call(ticketMetaCacheByOrderId[key], 'serviceSearchText') &&
    Object.prototype.hasOwnProperty.call(ticketMetaCacheByOrderId[key], 'dueAt') &&
    Object.prototype.hasOwnProperty.call(ticketMetaCacheByOrderId[key], 'hasPriorityFee') &&
    Number(ticketMetaCacheByOrderId[key].metaVersion || 0) === TICKET_META_CACHE_VERSION &&
    (Date.now() - Number(ticketMetaCacheByOrderId[key].fetchedAt || 0)) < TICKET_META_CACHE_TTL_MS
  ) {
    return ticketMetaCacheByOrderId[key];
  }
  const lookup = await fetchTicketLookupByOrderId(orderId, { forceFresh });
  if (!lookup?.summary?.id) {
    return emptyTicketMeta();
  }
  const detail = await fetchTicketDetailRobust(lookup.summary.id, orderId, { forceFresh });
  const detailServiceText = [];
  collectNestedStrings(detail?.devices || [], detailServiceText);
  const dueCandidates = [];
  collectLikelyDueTimestamps(lookup?.summary || {}, dueCandidates);
  collectLikelyDueTimestamps(detail?.summary || {}, dueCandidates);
  collectLikelyDueTimestamps(detail?.devices || [], dueCandidates);
  const serviceNames = Array.isArray(detail?.devices)
    ? detail.devices
      .flatMap((device) => Array.isArray(device?.repairProdItems) ? device.repairProdItems : [])
      .map((item) => String(item?.name || '').trim())
      .filter(Boolean)
    : [];
  const repairCategory = Array.isArray(detail?.devices)
    ? detail.devices
      .map((device) => device?.deviceCategoryName || device?.PostPreCategoryName || device?.device?.name || device?.device_name || device?.name || '')
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(', ')
    : '';
  const hasPriorityTicketAccessory = Array.isArray(detail?.accessory)
    ? detail.accessory.some((item) => {
      const name = String(item?.name || '');
      const sku = String(item?.sku || '');
      return /priority(?: service)? fee/i.test(name) || /^rush$/i.test(sku);
    })
    : false;
  let hasPriorityFee = hasPriorityTicketAccessory;
  const invoiceId = String(lookup?.summary?.invoice?.id || detail?.summary?.invoice?.id || '').trim();
  if (!hasPriorityFee && invoiceId) {
    const invoiceDetail = await fetchInvoiceDetail(invoiceId);
    const invoiceItems = Array.isArray(invoiceDetail?.items)
      ? invoiceDetail.items
      : (Array.isArray(invoiceDetail?.line_items) ? invoiceDetail.line_items : []);
    hasPriorityFee = invoiceItems.some((item) => {
      const name = String(item?.name || '');
      const sku = String(item?.sku || '');
      return /priority(?: service)? fee/i.test(name) || /^rush$/i.test(sku);
    });
  }
  const meta = {
    metaVersion: TICKET_META_CACHE_VERSION,
    fetchedAt: Date.now(),
    createdAt: Number(detail?.summary?.created_date || lookup?.summary?.created_date || 0) || null,
    updatedAt: Number(detail?.summary?.modified_on || 0) || null,
    repairCategory,
    serviceName: serviceNames.join(', '),
    serviceSearchText: detailServiceText.join(', '),
    dueAt: dueCandidates.length ? Math.min(...dueCandidates) : null,
    hasPriorityFee,
  };
  ticketMetaCacheByOrderId[key] = meta;
  saveTicketMetaCache();
  return meta;
}

function getInvoiceSummary(inv) {
  return inv?.summary || inv || {};
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function parseDueTimestamp(value) {
  if (!value || value === '0000-00-00 00:00:00') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e12) return value;
    if (value > 1e9) return value * 1000;
  }
  if (typeof value === 'string' && /^\d{10,13}$/.test(value.trim())) {
    const numeric = Number(value.trim());
    if (Number.isFinite(numeric)) {
      if (numeric > 1e12) return numeric;
      if (numeric > 1e9) return numeric * 1000;
    }
  }
  const isoLike = String(value).replace(' ', 'T');
  const timestamp = Date.parse(isoLike);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function localDateKeyFromTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTH_INDEX_BY_NAME = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

function normalizedBlockYear(rawYear, fallbackYear) {
  if (!rawYear) return fallbackYear;
  const numeric = Number(rawYear);
  if (!Number.isFinite(numeric)) return fallbackYear;
  if (numeric < 100) return 2000 + numeric;
  return numeric;
}

function temporaryBlockMatchesDate(rawEntry, date) {
  const entry = String(rawEntry || '').trim().toLowerCase();
  if (!entry) return false;
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (entry === iso) return true;

  let match = entry.match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{2,4}))?$/i);
  if (match) {
    const parsedMonth = MONTH_INDEX_BY_NAME[String(match[1] || '').toLowerCase()];
    const parsedDay = Number(match[2]);
    const parsedYear = normalizedBlockYear(match[3], year);
    if (parsedMonth !== undefined && parsedDay === day && parsedYear === year && parsedMonth === month) {
      return true;
    }
  }

  match = entry.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (match) {
    const parsedMonth = Number(match[1]) - 1;
    const parsedDay = Number(match[2]);
    const parsedYear = normalizedBlockYear(match[3], year);
    if (parsedMonth === month && parsedDay === day && parsedYear === year) {
      return true;
    }
  }

  return false;
}

function matchingTemporaryBlockLabel(date, blockedDates = []) {
  return blockedDates.find((entry) => temporaryBlockMatchesDate(entry, date)) || '';
}

function emptyTicketMeta() {
  return {
    createdAt: null,
    updatedAt: null,
    repairCategory: '',
    serviceName: '',
    serviceSearchText: '',
    dueAt: null,
    hasPriorityFee: false,
    isRushJob: false,
  };
}

async function fetchRushSyncMap() {
  const rushSync = sessionConfig?.rushSync || {};
  const enabled = !!rushSync.enabled;
  const cookie = normalizeRushSyncCookie(rushSync.cookie || '');
  const origin = getRushSyncOrigin(sessionConfig?.ticketCounterDisplayUrl || '');
  const configured = enabled && !!cookie && !!origin;

  if (!enabled) {
    const status = emptyRushSyncStatus({ enabled: false, configured: false, connected: false, usingFallback: true });
    rushSyncCache = { fetchedAt: 0, origin: '', cookie: '', map: Object.create(null), status };
    return { map: Object.create(null), status };
  }

  if (
    configured &&
    rushSyncCache.fetchedAt &&
    rushSyncCache.origin === origin &&
    rushSyncCache.cookie === cookie &&
    (Date.now() - rushSyncCache.fetchedAt) < RUSH_SYNC_CACHE_TTL_MS
  ) {
    return { map: rushSyncCache.map, status: rushSyncCache.status };
  }

  if (!configured) {
    const status = emptyRushSyncStatus({
      enabled: true,
      configured: false,
      connected: false,
      usingFallback: true,
      lastError: !origin
        ? 'Rush Sync needs a valid Ticket Counter Display URL to determine the RepairDesk store.'
        : 'Rush Sync is enabled but no RepairDesk session cookie has been saved yet.',
      alertKey: '',
    });
    rushSyncCache = {
      fetchedAt: Date.now(),
      origin,
      cookie,
      map: Object.create(null),
      status,
    };
    return { map: Object.create(null), status };
  }

  try {
    const rushMap = Object.create(null);
    let ticketCount = 0;
    let rushCount = 0;
    let page = 1;
    for (; page <= RUSH_SYNC_MAX_PAGES; page += 1) {
      const response = await rdWeb(origin, 'ticket/listings', {
        UnsavedTickets: 0,
        quick_checkin_tickets: 0,
        hide_close: 0,
        per_page: 100,
        page,
      }, cookie);
      const raw = parseJsonSafe(response.body);
      const rows = extractRushSyncListingRows(raw);
      if (response.status !== 200 || !raw || !Array.isArray(rows)) {
        throw new Error(`RepairDesk rush sync returned ${response.status} or unexpected data.`);
      }
      ticketCount += rows.length;
      for (const row of rows) {
        const orderId = String(row?.order_id || '').trim();
        if (!orderId) continue;
        if (isTruthyRushJob(row?.rush_job)) {
          rushMap[orderId] = true;
          rushCount += 1;
        }
      }
      if (!raw?.data?.next_page_url) break;
    }

    const status = emptyRushSyncStatus({
      enabled: true,
      configured: true,
      connected: true,
      usingFallback: false,
      lastCheckedAt: new Date().toISOString(),
      lastError: '',
      ticketCount,
      rushCount,
      alertKey: '',
    });
    rushSyncCache = {
      fetchedAt: Date.now(),
      origin,
      cookie,
      map: rushMap,
      status,
    };
    return { map: rushMap, status };
  } catch (error) {
    const status = emptyRushSyncStatus({
      enabled: true,
      configured: true,
      connected: false,
      usingFallback: true,
      lastCheckedAt: new Date().toISOString(),
      lastError: error.message || 'Rush Sync could not reach RepairDesk.',
      alertKey: `rush-sync-disconnected:${origin}:${String(error.message || 'unknown').slice(0, 160)}`,
    });
    rushSyncCache = {
      fetchedAt: Date.now(),
      origin,
      cookie,
      map: Object.create(null),
      status,
    };
    return { map: Object.create(null), status };
  }
}

async function fetchRushSyncListingRows(limitPages = RUSH_SYNC_MAX_PAGES) {
  const rushSync = sessionConfig?.rushSync || {};
  const enabled = !!rushSync.enabled;
  const cookie = normalizeRushSyncCookie(rushSync.cookie || '');
  const origin = getRushSyncOrigin(sessionConfig?.ticketCounterDisplayUrl || '');
  const configured = enabled && !!cookie && !!origin;

  if (!configured) {
    return {
      origin,
      rows: [],
      status: emptyRushSyncStatus({
        enabled,
        configured,
        connected: false,
        usingFallback: true,
        lastError: !enabled
          ? 'Rush Sync is disabled.'
          : (!origin
            ? 'Rush Sync needs a valid Ticket Counter Display URL to determine the RepairDesk store.'
            : 'Rush Sync is enabled but no RepairDesk session cookie has been saved yet.'),
      }),
    };
  }

  const rows = [];
  for (let page = 1; page <= limitPages; page += 1) {
    const response = await rdWeb(origin, 'ticket/listings', {
      UnsavedTickets: 0,
      quick_checkin_tickets: 0,
      hide_close: 0,
      per_page: 100,
      page,
    }, cookie);
    const raw = parseJsonSafe(response.body);
    const pageRows = extractRushSyncListingRows(raw);
    if (response.status !== 200 || !raw || !Array.isArray(pageRows)) {
      throw new Error(`RepairDesk rush sync returned ${response.status} or unexpected data.`);
    }
    rows.push(...pageRows);
    if (!raw?.data?.next_page_url) break;
  }

  return {
    origin,
    rows,
    status: emptyRushSyncStatus({
      enabled: true,
      configured: true,
      connected: true,
      usingFallback: false,
      lastCheckedAt: new Date().toISOString(),
      lastError: '',
      ticketCount: rows.length,
      rushCount: rows.filter((row) => isTruthyRushJob(row?.rush_job)).length,
    }),
  };
}

function isTruthyRushJob(value) {
  if (value === true || value === 1) return true;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function isScheduledStatus(status) {
  return /scheduled/i.test(String(status || ''));
}

function scheduledServiceLabelForRow(ticket) {
  return decodeHtml(ticket?.device_issue || '') || decodeHtml(ticket?.device || '') || null;
}

function collectNestedStrings(value, sink, depth = 0) {
  if (depth > 6 || value == null) return;
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    if (text) sink.push(text);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectNestedStrings(item, sink, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((nested) => collectNestedStrings(nested, sink, depth + 1));
  }
}

function collectLikelyDueTimestamps(value, sink, depth = 0) {
  if (depth > 6 || value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectLikelyDueTimestamps(item, sink, depth + 1));
    return;
  }
  if (typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value)) {
    if (nested == null) continue;
    if (/(^|_)(due|due_on|due_at|due_date)$|due(On|At|Date)$/i.test(key)) {
      const timestamp = parseDueTimestamp(nested);
      if (timestamp) sink.push(timestamp);
    }
    collectLikelyDueTimestamps(nested, sink, depth + 1);
  }
}

function collectRushSignals(value, sink, pathParts = [], depth = 0) {
  if (depth > 6 || value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectRushSignals(item, sink, [...pathParts, index], depth + 1));
    return;
  }
  if (typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value)) {
    const currentPath = [...pathParts, key];
    const keyText = String(key || '');
    if (/rush|priority/i.test(keyText)) {
      sink.push({
        path: currentPath.join('.'),
        value: nested,
      });
    }
    if (nested && typeof nested === 'object') {
      collectRushSignals(nested, sink, currentPath, depth + 1);
    }
  }
}

function isScheduledServiceName(value, preferences = DEFAULT_UI_PREFERENCES) {
  return false;
}

function isCalendarAppointmentTicket(ticket, preferences = DEFAULT_UI_PREFERENCES) {
  return !!(ticket?.dueAt && isScheduledStatus(ticket?.status));
}

function buildCustomerName(ticket) {
  const name = [ticket?.first_name, ticket?.last_name]
    .map((part) => decodeHtml(part).trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  if (name) return name;
  const organization = decodeHtml(ticket?.orgonization || ticket?.organization || '');
  return organization || 'Walk-in Customer';
}

function buildDisplayFirstName(ticket) {
  const organization = decodeHtml(ticket?.orgonization || ticket?.organization || '').trim();
  const lastName = decodeHtml(ticket?.last_name || '').trim();
  const firstName = decodeHtml(ticket?.first_name || '').trim();
  if (organization) return 'Business Customer';
  if (/^\(.*\)$/.test(lastName)) return 'Business Customer';
  if (/^walk[\s-]*in$/i.test(firstName)) return 'Walk-in Customer';
  if (firstName) return firstName;
  return 'Walk-in Customer';
}

function splitCustomerName(fullName = '') {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: '', lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function startOfCurrentWeekMonday(now = new Date()) {
  const date = new Date(now);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + diffToMonday);
  return date;
}

async function fetchScheduledAppointmentFallbackRows(existingOrderIds = new Set(), options = {}) {
  const maxPages = Math.max(1, Number(options.maxPages || 2) || 2);
  const maxCandidates = Math.max(1, Number(options.maxCandidates || 40) || 40);
  const lookbackDays = Math.max(1, Number(options.lookbackDays || 30) || 30);
  const calendarWindowDays = Math.max(7, Number(options.calendarWindowDays || 14) || 14);
  const lookbackCutoffUnix = Math.floor((Date.now() - (lookbackDays * 86400 * 1000)) / 1000);
  const monday = startOfCurrentWeekMonday(new Date());
  const windowStartMs = monday.getTime();
  const windowEndMs = windowStartMs + (calendarWindowDays * 24 * 60 * 60 * 1000);

  const publicTickets = await fetchPaginated(
    'tickets',
    {},
    (raw) => Array.isArray(raw?.data?.ticketData) ? raw.data.ticketData : [],
    maxPages
  );

  const candidateSummaries = publicTickets
    .map((ticket) => ticket?.summary || ticket || {})
    .filter((summary) => {
      const orderId = String(summary?.order_id || '').trim();
      if (!orderId || existingOrderIds.has(orderId)) return false;
      const createdAt = Number(summary?.created_date || 0) || 0;
      return !createdAt || createdAt >= lookbackCutoffUnix;
    })
    .sort((a, b) => (Number(b?.created_date || 0) || 0) - (Number(a?.created_date || 0) || 0))
    .slice(0, maxCandidates);

  const syntheticRows = [];
  for (const summary of candidateSummaries) {
    const orderId = String(summary?.order_id || '').trim();
    if (!orderId) continue;

    let meta = null;
    try {
      meta = await fetchTicketMetaByOrderId(orderId, { forceFresh: true });
    } catch (error) {
      console.log(`[APPOINTMENTS] Fallback meta lookup failed for order=${orderId}: ${error.message}`);
      continue;
    }

    const dueAt = Number(meta?.dueAt || 0) || null;
    const isScheduled = /scheduled/i.test(String(meta?.serviceSearchText || ''));
    if (!dueAt || !isScheduled) continue;
    if (dueAt < windowStartMs || dueAt >= windowEndMs) continue;

    const customer = summary?.customer || {};
    const fullName = String(customer?.fullName || '').trim();
    const splitName = splitCustomerName(fullName);
    syntheticRows.push({
      order_id: orderId,
      orderIdToSort: Number(orderId) || 0,
      first_name: customer?.firstName || splitName.firstName,
      last_name: customer?.lastName || splitName.lastName,
      orgonization: customer?.orgonization || customer?.organization || '',
      status: 'Scheduled',
      assignee_name: '',
      inv_type: 0,
      due_on: '',
      device_issue: String(meta?.serviceName || '')
        .split(',')
        .map((part) => String(part || '').trim())
        .filter(Boolean)[0] || 'Tech Support',
      device: String(meta?.repairCategory || '').trim() || null,
    });
  }

  return syntheticRows;
}

function buildCustomerDisplayName(ticket, preferences = DEFAULT_UI_PREFERENCES) {
  const mode = String(preferences?.display?.customerNameMode || DEFAULT_UI_PREFERENCES.display.customerNameMode).toLowerCase();
  if (mode === 'hide') return 'Customer';
  if (mode === 'full_name') return buildCustomerName(ticket);
  return buildDisplayFirstName(ticket);
}

function isInternalRefurbishmentTicket(ticket) {
  const taskType = decodeHtml(ticket?.task_type || ticket?.taskType || '').trim();
  if (/refurbishment/i.test(taskType)) return true;
  return buildCustomerName(ticket) === 'Walk-in Customer';
}

function extractStatusColor(rawStatusLabel) {
  const label = String(rawStatusLabel || '');
  const match = label.match(/background:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\))/i);
  if (match) return match[1];
  if (/label-success/.test(label)) return '#43c35e';
  if (/label-warning/.test(label)) return '#e0a13b';
  return '#64748b';
}

function durationRuleToHours(rule = {}) {
  const days = Math.max(0, Number(rule.days) || 0);
  const hours = Math.max(0, Number(rule.hours) || 0);
  return (days * 24) + hours;
}

function pinnedPrioritySortValue(ticket) {
  if (ticket?.isRushJob) return 0;
  if (ticket?.isPriorityTicket) return 1;
  return 2;
}

function compareWithPinnedPriority(preferences, left, right) {
  if (!preferences?.display?.pinPriorityTickets) return 0;
  return pinnedPrioritySortValue(left) - pinnedPrioritySortValue(right);
}

function normalizeStatusMatchValue(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesConfiguredStatus(status, configuredStatuses = []) {
  const normalizedStatus = normalizeStatusMatchValue(status);
  if (!normalizedStatus) return false;
  return configuredStatuses.some((configuredStatus) => {
    const normalizedConfiguredStatus = normalizeStatusMatchValue(configuredStatus);
    return normalizedConfiguredStatus && normalizedStatus.includes(normalizedConfiguredStatus);
  });
}

function findMatchingColumnForStatus(status, columns = {}) {
  for (const column of Object.values(columns)) {
    if (matchesConfiguredStatus(status, column?.statuses || [])) {
      return column;
    }
  }
  return null;
}

function rushSyncRowStatus(row) {
  return decodeHtml(row?.status || row?.collective_status || row?.ticket_status || 'Unknown').trim();
}

function buildTicketCounterFallbackRowFromRushSync(row) {
  const orderId = String(row?.order_id || '').trim();
  if (!orderId) return null;
  return {
    order_id: orderId,
    first_name: String(row?.first_name || row?.customer?.first_name || '').trim(),
    last_name: String(row?.last_name || row?.customer?.last_name || '').trim(),
    orgonization: String(row?.orgonization || row?.organization || row?.customer?.orgonization || row?.customer?.organization || '').trim(),
    status: rushSyncRowStatus(row),
    assignee_name: String(row?.assignee_name || row?.assignee?.fullname || row?.assignee?.name || '').trim(),
    inv_type: Number(row?.inv_type || 0) || 0,
    due_on: String(row?.due_on || row?.due_date || row?.due_at || '').trim(),
    device_issue: String(row?.device_issue || row?.issue || row?.ticket_label || row?.title || '').trim(),
    device: String(row?.device || row?.device_name || row?.device_model || '').trim(),
    orderIdToSort: Number(row?.order_id || 0) || 0,
    rush_job: row?.rush_job,
    __source: 'rush_sync_fallback',
  };
}

function mergeTicketCounterRowsWithRushSyncFallback(ticketsRaw, rushSyncRows = [], uiPreferences = DEFAULT_UI_PREFERENCES) {
  const rawTickets = Array.isArray(ticketsRaw?.data?.pagination?.data) ? ticketsRaw.data.pagination.data : [];
  if (!Array.isArray(rushSyncRows) || !rushSyncRows.length) {
    return {
      mergedPayload: ticketsRaw,
      addedRows: [],
    };
  }

  const preferences = normalizeUiPreferences(uiPreferences);
  const configuredStatuses = Object.values(preferences.columns)
    .flatMap((column) => Array.isArray(column?.statuses) ? column.statuses : [])
    .map((status) => normalizeStatusMatchValue(status))
    .filter(Boolean);
  if (!configuredStatuses.length) {
    return {
      mergedPayload: ticketsRaw,
      addedRows: [],
    };
  }

  const existingOrderStatusPairs = new Set(rawTickets.map((ticket) => [
    String(ticket?.order_id || '').trim(),
    normalizeStatusMatchValue(ticket?.status || ''),
  ].join('|')));

  const addedRows = [];
  for (const row of rushSyncRows) {
    const fallbackRow = buildTicketCounterFallbackRowFromRushSync(row);
    if (!fallbackRow) continue;
    const normalizedStatus = normalizeStatusMatchValue(fallbackRow.status);
    if (!normalizedStatus) continue;
    if (!configuredStatuses.some((configuredStatus) => normalizedStatus.includes(configuredStatus))) {
      continue;
    }
    const dedupeKey = `${fallbackRow.order_id}|${normalizedStatus}`;
    if (existingOrderStatusPairs.has(dedupeKey)) continue;
    existingOrderStatusPairs.add(dedupeKey);
    addedRows.push(fallbackRow);
  }

  if (!addedRows.length) {
    return {
      mergedPayload: ticketsRaw,
      addedRows: [],
    };
  }

  return {
    mergedPayload: {
      ...ticketsRaw,
      data: {
        ...(ticketsRaw?.data || {}),
        pagination: {
          ...(ticketsRaw?.data?.pagination || {}),
          data: [...rawTickets, ...addedRows],
        },
      },
      _fetchDebug: {
        ...(ticketsRaw?._fetchDebug || {}),
        rushSyncFallbackRowsAdded: addedRows.length,
      },
    },
    addedRows,
  };
}

function normalizeTicketCounterPayload(
  configRaw,
  ticketsRaw,
  ticketMetaByOrderId = {},
  uiPreferences = DEFAULT_UI_PREFERENCES,
  rushSyncMap = Object.create(null),
  rushSyncStatus = emptyRushSyncStatus()
) {
  const config = configRaw?.data || {};
  const ticketsData = ticketsRaw?.data || {};
  const preferences = normalizeUiPreferences(uiPreferences);
  const statusOrder = Array.isArray(config.status) ? config.status : [];
  const summaryPriority = [
    preferences.columns.readyToStart.label,
    preferences.columns.inProgress.label,
    preferences.columns.needsAttention.label,
    preferences.columns.waiting.label,
    preferences.columns.qualityControl.label,
    preferences.columns.column6.label,
  ];
  const rawTickets = Array.isArray(ticketsData?.pagination?.data) ? ticketsData.pagination.data : [];
  const rawCounts = Array.isArray(ticketsData?.total_res) ? ticketsData.total_res : [];
  const statusCountMap = Object.create(null);
  const groupedByOrder = new Map();
  const visibleColumns = Object.values(preferences.columns).filter((column) => column.visible !== false);
  const rawStatusLabels = ticketsRaw?.status_label && typeof ticketsRaw.status_label === 'object'
    ? ticketsRaw.status_label
    : {};
  const statusColors = Object.fromEntries(
    Object.entries(rawStatusLabels).map(([status, rawLabel]) => [status, extractStatusColor(rawLabel)])
  );

  for (const row of rawCounts) {
    const status = decodeHtml(row?.status || '').trim();
    if (!status) continue;
    statusCountMap[status] = (statusCountMap[status] || 0) + 1;
  }

  for (const ticket of rawTickets) {
    const orderId = String(ticket?.order_id || '').trim();
    if (!orderId) continue;

    const status = decodeHtml(ticket?.status || 'Unknown');
    const dueAt = parseDueTimestamp(ticket?.due_on);
    const metaDueAt = Number(ticketMetaByOrderId[orderId]?.dueAt || 0) || null;
    const ticketIsScheduled = isScheduledStatus(status);
    const effectiveScheduledDueAt = ticketIsScheduled ? (dueAt || metaDueAt || null) : null;
    const rawRushJob = isTruthyRushJob(ticket?.rush_job);
    const syncedRushJob = !!rushSyncMap[orderId];
    let entry = groupedByOrder.get(orderId);

    if (!entry) {
      entry = {
        orderId,
        status,
        customerName: buildCustomerDisplayName(ticket, preferences),
        organization: '',
        assigneeName: decodeHtml(ticket?.assignee_name || '') || 'Unassigned',
        dueOn: ticket?.due_on || null,
        dueAt: effectiveScheduledDueAt || dueAt || metaDueAt || null,
        scheduledDueOn: ticketIsScheduled ? (ticket?.due_on || null) : null,
        scheduledDueAt: effectiveScheduledDueAt,
        scheduledServiceLabel: ticketIsScheduled ? scheduledServiceLabelForRow(ticket) : null,
        createdAt: Number(ticketMetaByOrderId[orderId]?.createdAt || 0) || null,
        updatedAt: Number(ticketMetaByOrderId[orderId]?.updatedAt || 0) || null,
        repairCategory: String(ticketMetaByOrderId[orderId]?.repairCategory || '').trim(),
        serviceName: String(ticketMetaByOrderId[orderId]?.serviceName || '').trim(),
        serviceSearchText: String(ticketMetaByOrderId[orderId]?.serviceSearchText || '').trim(),
        hasPriorityFee: !!ticketMetaByOrderId[orderId]?.hasPriorityFee,
        isRushJob: rawRushJob || syncedRushJob || !!ticketMetaByOrderId[orderId]?.isRushJob,
        isPriorityTicket: rawRushJob || syncedRushJob || !!ticketMetaByOrderId[orderId]?.isRushJob || !!ticketMetaByOrderId[orderId]?.hasPriorityFee,
        isRefurb: !!ticketMetaByOrderId[orderId]?.isRefurb,
        statusColor: statusColors[status] || '#64748b',
        rowStatuses: [status],
        devices: [],
        issues: [],
        issueCount: 0,
        sortOrderId: Number(ticket?.orderIdToSort || ticket?.order_id || 0) || 0,
      };
      groupedByOrder.set(orderId, entry);
    }

    if (rawRushJob || syncedRushJob) {
      entry.isRushJob = true;
      entry.isPriorityTicket = true;
    } else if (entry.hasPriorityFee) {
      entry.isPriorityTicket = true;
    }

    if (isInternalRefurbishmentTicket(ticket)) {
      entry.isRefurb = true;
    }
    if (status && !entry.rowStatuses.includes(status)) {
      entry.rowStatuses.push(status);
    }

    const device = decodeHtml(ticket?.device || '');
    const issue = decodeHtml(ticket?.device_issue || '');
    if (device && !entry.devices.includes(device)) {
      entry.devices.push(device);
    }
    if (issue && issue !== '-' && issue !== '\u00a0' && !entry.issues.includes(issue)) {
      entry.issues.push(issue);
    }
    entry.issueCount = entry.issues.length;
    if (ticketIsScheduled && effectiveScheduledDueAt && (!entry.scheduledDueAt || effectiveScheduledDueAt !== entry.scheduledDueAt)) {
      entry.status = status;
      entry.scheduledDueAt = effectiveScheduledDueAt;
      entry.scheduledDueOn = ticket?.due_on || entry.scheduledDueOn;
      entry.scheduledServiceLabel = scheduledServiceLabelForRow(ticket) || entry.scheduledServiceLabel;
      entry.dueAt = effectiveScheduledDueAt;
      entry.dueOn = ticket?.due_on || entry.dueOn;
    } else if (!entry.scheduledDueAt && ((!entry.dueAt && dueAt) || (dueAt && entry.dueAt && dueAt < entry.dueAt))) {
      entry.dueAt = dueAt;
      entry.dueOn = ticket?.due_on || entry.dueOn;
    }
    if (!entry.dueAt && Number(ticketMetaByOrderId[orderId]?.dueAt || 0)) {
      entry.dueAt = Number(ticketMetaByOrderId[orderId].dueAt) || null;
    }
    if (entry.assigneeName === 'Unassigned' && ticket?.assignee_name) {
      entry.assigneeName = decodeHtml(ticket.assignee_name);
    }
  }

  for (const entry of groupedByOrder.values()) {
    const qualityControlStatus = entry.rowStatuses.find((status) => matchesConfiguredStatus(status, preferences.columns.qualityControl.statuses));
    const waitingStatus = entry.rowStatuses.find((status) => matchesConfiguredStatus(status, preferences.columns.waiting.statuses));
    if (qualityControlStatus) {
      entry.status = qualityControlStatus;
      entry.statusColor = statusColors[qualityControlStatus] || entry.statusColor;
      continue;
    }
    if (waitingStatus) {
      entry.status = waitingStatus;
      entry.statusColor = statusColors[waitingStatus] || entry.statusColor;
    }
  }

  const statusIndex = new Map(statusOrder.map((status, index) => [status, index]));
  const availableAssignees = Array.from(new Set(
    Array.from(groupedByOrder.values()).map((ticket) => String(ticket.assigneeName || '').trim() || 'Unassigned')
  )).sort((a, b) => a.localeCompare(b));
  const selectedAssignees = new Set(
    normalizeStringArray(preferences.display.assigneeFilter, [])
      .map((name) => String(name || '').trim())
      .filter(Boolean)
  );

  const allTickets = Array.from(groupedByOrder.values())
    .filter((ticket) => !selectedAssignees.size || selectedAssignees.has(String(ticket.assigneeName || '').trim() || 'Unassigned'))
    .sort((a, b) => {
    const statusA = statusIndex.has(a.status) ? statusIndex.get(a.status) : Number.MAX_SAFE_INTEGER;
    const statusB = statusIndex.has(b.status) ? statusIndex.get(b.status) : Number.MAX_SAFE_INTEGER;
    if (statusA !== statusB) return statusA - statusB;
    if ((a.dueAt || Infinity) !== (b.dueAt || Infinity)) return (a.dueAt || Infinity) - (b.dueAt || Infinity);
    return b.sortOrderId - a.sortOrderId;
  });

  const mergedStatusCountMap = Object.create(null);
  for (const [status, count] of Object.entries(statusCountMap)) {
    const displayStatus = findMatchingColumnForStatus(status, preferences.columns)?.label || status;
    mergedStatusCountMap[displayStatus] = (mergedStatusCountMap[displayStatus] || 0) + count;
  }

  const mergedStatusOrder = [];
  for (const status of statusOrder) {
    const displayStatus = findMatchingColumnForStatus(status, preferences.columns)?.label || status;
    if (!mergedStatusOrder.includes(displayStatus)) {
      mergedStatusOrder.push(displayStatus);
    }
  }

  const summaryStatusOrder = [
    ...visibleColumns.map((column) => column.label),
    ...mergedStatusOrder.filter((status) => !summaryPriority.includes(status)),
  ].filter((status, index, list) => list.indexOf(status) === index);

  const readyQueue = allTickets
    .filter((ticket) => matchesConfiguredStatus(ticket.status, preferences.columns.readyToStart.statuses))
    .map((ticket) => {
      const createdAt = Number(ticket.createdAt || 0) || null;
      const waitingHours = createdAt
        ? Math.max(0, Math.floor((Date.now() - (createdAt * 1000)) / (1000 * 60 * 60)))
        : null;
      const waitingDays = createdAt
        ? Math.max(0, Math.floor((Date.now() - (createdAt * 1000)) / (1000 * 60 * 60 * 24)))
        : null;
      return {
        orderId: ticket.orderId,
        customerName: ticket.customerName,
        assigneeName: ticket.assigneeName,
        devices: ticket.devices,
        issues: ticket.issues,
        createdAt,
        updatedAt: ticket.updatedAt,
        waitingHours,
        waitingDays,
        status: ticket.status,
        statusColor: ticket.statusColor,
        hasPriorityFee: ticket.hasPriorityFee,
        isRushJob: !!ticket.isRushJob,
        isPriorityTicket: !!ticket.isPriorityTicket,
        isRefurb: !!ticket.isRefurb,
      };
    })
    .sort((a, b) => {
      const prioritySort = compareWithPinnedPriority(preferences, a, b);
      if (prioritySort !== 0) return prioritySort;
      if ((a.createdAt || Infinity) !== (b.createdAt || Infinity)) {
        return (a.createdAt || Infinity) - (b.createdAt || Infinity);
      }
      return Number(a.orderId || 0) - Number(b.orderId || 0);
    });

  const needsAttentionQueue = allTickets
    .filter((ticket) => matchesConfiguredStatus(ticket.status, preferences.columns.needsAttention.statuses))
    .map((ticket) => {
      const lastTouchedAt = Number(ticket.updatedAt || ticket.createdAt || 0) || null;
      const staleDays = lastTouchedAt
        ? (Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60 * 24)
        : null;
      return {
      orderId: ticket.orderId,
      status: ticket.status,
      statusColor: ticket.statusColor,
      customerName: ticket.customerName,
      assigneeName: ticket.assigneeName,
      devices: ticket.devices,
      issues: ticket.issues,
      dueOn: ticket.dueOn,
      dueAt: ticket.dueAt,
      updatedAt: ticket.updatedAt,
      hasPriorityFee: ticket.hasPriorityFee,
      isRushJob: !!ticket.isRushJob,
      isPriorityTicket: !!ticket.isPriorityTicket,
      isRefurb: !!ticket.isRefurb,
      waitingHours: lastTouchedAt
        ? Math.max(0, Math.floor((Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60)))
        : null,
      waitingDays: lastTouchedAt
        ? Math.max(0, Math.floor((Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60 * 24)))
        : null,
      staleDays,
      staleHours: lastTouchedAt
        ? (Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60)
        : null,
      staleThresholdHours: durationRuleToHours(preferences.staleRules.needsAttention),
      sortTouchedAt: lastTouchedAt,
      };
    })
    .sort((a, b) => {
      const prioritySort = compareWithPinnedPriority(preferences, a, b);
      if (prioritySort !== 0) return prioritySort;
      if ((a.sortTouchedAt || Infinity) !== (b.sortTouchedAt || Infinity)) {
        return (a.sortTouchedAt || Infinity) - (b.sortTouchedAt || Infinity);
      }
      return Number(a.orderId || 0) - Number(b.orderId || 0);
    });

  const inProgressQueue = allTickets
    .filter((ticket) => matchesConfiguredStatus(ticket.status, preferences.columns.inProgress.statuses))
    .map((ticket) => {
      const lastTouchedAt = Number(ticket.updatedAt || ticket.createdAt || 0) || null;
      return {
      orderId: ticket.orderId,
      status: ticket.status,
      statusColor: ticket.statusColor,
      customerName: ticket.customerName,
      assigneeName: ticket.assigneeName,
      devices: ticket.devices,
      issues: ticket.issues,
      dueOn: ticket.dueOn,
      dueAt: ticket.dueAt,
      updatedAt: ticket.updatedAt,
      hasPriorityFee: ticket.hasPriorityFee,
      isRushJob: !!ticket.isRushJob,
      isPriorityTicket: !!ticket.isPriorityTicket,
      isRefurb: !!ticket.isRefurb,
      waitingHours: lastTouchedAt
        ? Math.max(0, Math.floor((Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60)))
        : null,
      waitingDays: lastTouchedAt
        ? Math.max(0, Math.floor((Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60 * 24)))
        : null,
      staleHours: lastTouchedAt
        ? (Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60)
        : null,
      staleThresholdHours: durationRuleToHours(preferences.staleRules.inProgress),
      };
    })
    .sort((a, b) => {
      const prioritySort = compareWithPinnedPriority(preferences, a, b);
      if (prioritySort !== 0) return prioritySort;
      if ((a.updatedAt || 0) !== (b.updatedAt || 0)) {
        return (a.updatedAt || 0) - (b.updatedAt || 0);
      }
      return Number(a.orderId || 0) - Number(b.orderId || 0);
    });

  const waitingQueue = allTickets
    .filter((ticket) => matchesConfiguredStatus(ticket.status, preferences.columns.waiting.statuses))
    .map((ticket) => {
      const lastTouchedAt = Number(ticket.updatedAt || ticket.createdAt || 0) || null;
      const waitingDays = lastTouchedAt
        ? Math.max(0, Math.floor((Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60 * 24)))
        : null;
      const staleThresholdHours = ticket.status === 'Waiting on Customer'
        ? durationRuleToHours(preferences.staleRules.waitingOnCustomer)
        : durationRuleToHours(preferences.staleRules.waitingForParts);
      return {
        orderId: ticket.orderId,
        status: ticket.status,
        statusColor: ticket.statusColor,
        customerName: ticket.customerName,
        assigneeName: ticket.assigneeName,
        devices: ticket.devices,
        issues: ticket.issues,
        dueOn: ticket.dueOn,
        dueAt: ticket.dueAt,
        updatedAt: ticket.updatedAt,
        hasPriorityFee: ticket.hasPriorityFee,
        isRushJob: !!ticket.isRushJob,
        isPriorityTicket: !!ticket.isPriorityTicket,
        isRefurb: !!ticket.isRefurb,
        waitingHours: lastTouchedAt
          ? Math.max(0, Math.floor((Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60)))
          : null,
        waitingDays,
        staleDays: lastTouchedAt
          ? (Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60 * 24)
          : null,
        staleHours: lastTouchedAt
          ? (Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60)
          : null,
        staleThresholdHours,
      };
    })
    .sort((a, b) => {
      const prioritySort = compareWithPinnedPriority(preferences, a, b);
      if (prioritySort !== 0) return prioritySort;
      if ((a.updatedAt || 0) !== (b.updatedAt || 0)) {
        return (a.updatedAt || 0) - (b.updatedAt || 0);
      }
      return Number(a.orderId || 0) - Number(b.orderId || 0);
    });

  const qualityControlQueue = allTickets
    .filter((ticket) => matchesConfiguredStatus(ticket.status, preferences.columns.qualityControl.statuses))
    .map((ticket) => {
      const lastTouchedAt = Number(ticket.updatedAt || ticket.createdAt || 0) || null;
      return {
        orderId: ticket.orderId,
        status: ticket.status,
        statusColor: ticket.statusColor,
        customerName: ticket.customerName,
        assigneeName: ticket.assigneeName,
        devices: ticket.devices,
        issues: ticket.issues,
        dueOn: ticket.dueOn,
        dueAt: ticket.dueAt,
        updatedAt: ticket.updatedAt,
        hasPriorityFee: ticket.hasPriorityFee,
        isRushJob: !!ticket.isRushJob,
        isPriorityTicket: !!ticket.isPriorityTicket,
        isRefurb: !!ticket.isRefurb,
        waitingHours: lastTouchedAt
          ? Math.max(0, Math.floor((Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60)))
          : null,
        waitingDays: lastTouchedAt
          ? Math.max(0, Math.floor((Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60 * 24)))
          : null,
        staleHours: lastTouchedAt
          ? (Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60)
          : null,
        staleThresholdHours: durationRuleToHours(preferences.staleRules.qualityControl),
      };
    })
    .sort((a, b) => {
      const prioritySort = compareWithPinnedPriority(preferences, a, b);
      if (prioritySort !== 0) return prioritySort;
      if ((a.updatedAt || 0) !== (b.updatedAt || 0)) {
        return (a.updatedAt || 0) - (b.updatedAt || 0);
      }
      return Number(a.orderId || 0) - Number(b.orderId || 0);
    });

  const column6Queue = allTickets
    .filter((ticket) => matchesConfiguredStatus(ticket.status, preferences.columns.column6.statuses))
    .map((ticket) => {
      const createdAt = Number(ticket.createdAt || 0) || null;
      const lastTouchedAt = Number(ticket.updatedAt || ticket.createdAt || 0) || null;
      return {
        orderId: ticket.orderId,
        status: ticket.status,
        statusColor: ticket.statusColor,
        customerName: ticket.customerName,
        assigneeName: ticket.assigneeName,
        devices: ticket.devices,
        issues: ticket.issues,
        dueOn: ticket.dueOn,
        dueAt: ticket.dueAt,
        updatedAt: ticket.updatedAt,
        hasPriorityFee: ticket.hasPriorityFee,
        isRushJob: !!ticket.isRushJob,
        isPriorityTicket: !!ticket.isPriorityTicket,
        isRefurb: !!ticket.isRefurb,
        waitingHours: lastTouchedAt
          ? Math.max(0, Math.floor((Date.now() - (lastTouchedAt * 1000)) / (1000 * 60 * 60)))
          : null,
        waitingDays: createdAt
          ? Math.max(0, Math.floor((Date.now() - (createdAt * 1000)) / (1000 * 60 * 60 * 24)))
          : null,
      };
    })
    .sort((a, b) => {
      const prioritySort = compareWithPinnedPriority(preferences, a, b);
      if (prioritySort !== 0) return prioritySort;
      if ((a.updatedAt || 0) !== (b.updatedAt || 0)) {
        return (a.updatedAt || 0) - (b.updatedAt || 0);
      }
      return Number(a.orderId || 0) - Number(b.orderId || 0);
    });

  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + diffToMonday);
  const allWeekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const includedWeekdays = allWeekdays.filter((weekday) => preferences.schedule.includedWeekdays.includes(weekday));
  const weekdays = includedWeekdays.length ? includedWeekdays : DEFAULT_UI_PREFERENCES.schedule.includedWeekdays;
  function buildCalendarWeek(weekOffset = 0) {
    return weekdays.map((label) => {
      const weekdayIndex = allWeekdays.indexOf(label);
      const date = new Date(monday);
      date.setDate(monday.getDate() + weekdayIndex + (weekOffset * 7));
      const iso = date.toISOString().slice(0, 10);
      const temporaryBlockedLabel = matchingTemporaryBlockLabel(date, preferences.schedule.temporaryBlockedDates);
      return {
        label,
        iso,
        blocked: preferences.schedule.blockedWeekdays.includes(label) || !!temporaryBlockedLabel,
        blockedReason: temporaryBlockedLabel ? `Temporarily blocked (${temporaryBlockedLabel})` : '',
        appointments: allTickets
          .filter((ticket) => isCalendarAppointmentTicket(ticket, preferences))
          .filter((ticket) => localDateKeyFromTimestamp(ticket.dueAt) === iso)
          .sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0))
          .map((ticket) => ({
            orderId: ticket.orderId,
            customerName: ticket.customerName,
            dueOn: ticket.dueOn,
            dueAt: ticket.dueAt,
            device: ticket.scheduledServiceLabel || ticket.serviceName || ticket.issues[0] || ticket.devices[0] || '',
          })),
      };
    });
  }

  const scheduledCalendar = buildCalendarWeek(0);
  const nextScheduledCalendar = buildCalendarWeek(1);
  const groupedColumnCounts = {
    [preferences.columns.readyToStart.label]: readyQueue.length,
    [preferences.columns.inProgress.label]: inProgressQueue.length,
    [preferences.columns.needsAttention.label]: needsAttentionQueue.length,
    [preferences.columns.waiting.label]: waitingQueue.length,
    [preferences.columns.qualityControl.label]: qualityControlQueue.length,
    [preferences.columns.column6.label]: column6Queue.length,
  };

  const columnTicketIds = new Set([
    ...readyQueue.map((ticket) => ticket.orderId),
    ...inProgressQueue.map((ticket) => ticket.orderId),
    ...needsAttentionQueue.map((ticket) => ticket.orderId),
    ...waitingQueue.map((ticket) => ticket.orderId),
    ...qualityControlQueue.map((ticket) => ticket.orderId),
    ...column6Queue.map((ticket) => ticket.orderId),
    ...allTickets.filter((ticket) => isCalendarAppointmentTicket(ticket, preferences)).map((ticket) => ticket.orderId),
  ]);
  const tickets = allTickets.filter((ticket) => !columnTicketIds.has(ticket.orderId));
  const oldestRegularReadyTicket = readyQueue.find((ticket) => ticket.customerName !== 'Walk-in Customer') || null;
  const activePriorityTickets = [...readyQueue, ...inProgressQueue]
    .filter((ticket) => ticket.isPriorityTicket && ticket.customerName !== 'Walk-in Customer')
    .sort((a, b) => {
      if ((b.waitingDays ?? -1) !== (a.waitingDays ?? -1)) {
        return (b.waitingDays ?? -1) - (a.waitingDays ?? -1);
      }
      return Number(a.orderId || 0) - Number(b.orderId || 0);
    });
  const oldestPriorityReadyTicket = activePriorityTickets[0] || null;

  return {
    fetchedAt: new Date().toISOString(),
    refreshMinutes: Number(config?.time_val || 1) || 1,
    displayTicketCounts: String(config?.add_ticket_count_trigger || '0') === '1',
    image: {
      enabled: Number(config?.add_image_trigger || 0) === 1,
      path: config?.add_image_path || '',
      url: config?.add_image_path ? `https://dghyt15qon7us.cloudfront.net/uploads/Tcd/${config.add_image_path}` : '',
    },
    columns: Array.isArray(config?.columns) ? config.columns : [],
    statusOrder,
    statusCounts: summaryStatusOrder.map((status) => ({
      status,
      count: groupedColumnCounts[status] ?? mergedStatusCountMap[status] ?? 0,
    })),
    allStatuses: Object.entries(mergedStatusCountMap)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    tickets,
    readyQueue,
    needsAttentionQueue,
    inProgressQueue,
    waitingQueue,
    qualityControlQueue,
    column6Queue,
    scheduledCalendar,
    nextScheduledCalendar,
    rushSync: rushSyncStatus,
    uiPreferences: preferences,
    statusColors,
    assignees: availableAssignees,
    totals: {
      tickets: allTickets.length,
      oldestRegularReadyDays: oldestRegularReadyTicket?.waitingDays ?? null,
      oldestPriorityReadyDays: oldestPriorityReadyTicket?.waitingDays ?? null,
      uncategorizedTickets: tickets.length,
      issues: rawTickets.length,
      unassigned: allTickets.filter((ticket) => ticket.assigneeName === 'Unassigned').length,
      dueToday: allTickets.filter((ticket) => {
        if (!ticket.dueAt) return false;
        return new Date(ticket.dueAt).toDateString() === new Date().toDateString();
      }).length,
    },
  };
}

function queuePlacementForOrderId(payload, orderId) {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId || !payload || typeof payload !== 'object') return null;

  const queueDefinitions = [
    ['readyQueue', 'readyToStart'],
    ['inProgressQueue', 'inProgress'],
    ['needsAttentionQueue', 'needsAttention'],
    ['waitingQueue', 'waiting'],
    ['qualityControlQueue', 'qualityControl'],
    ['column6Queue', 'column6'],
    ['tickets', 'uncategorized'],
  ];

  for (const [key, columnKey] of queueDefinitions) {
    const match = Array.isArray(payload[key])
      ? payload[key].find((ticket) => String(ticket?.orderId || '').trim() === normalizedOrderId)
      : null;
    if (match) {
      return {
        queueKey: key,
        columnKey,
        ticket: match,
      };
    }
  }

  for (const [weekKey, weekLabel] of [['scheduledCalendar', 'this_week'], ['nextScheduledCalendar', 'next_week']]) {
    const week = Array.isArray(payload[weekKey]) ? payload[weekKey] : [];
    for (const day of week) {
      const appointment = Array.isArray(day?.appointments)
        ? day.appointments.find((ticket) => String(ticket?.orderId || '').trim() === normalizedOrderId)
        : null;
      if (appointment) {
        return {
          queueKey: weekKey,
          columnKey: weekLabel,
          dayIso: day.iso,
          ticket: appointment,
        };
      }
    }
  }

  return null;
}

function getInvoiceLineItems(inv, detail = null) {
  const normalizeItems = (items) => items.map((item) => ({
    id: item?.id ?? '',
    name: item?.name || '',
    sku: item?.sku || '',
    upc: item?.upc || '',
    price: item?.price ?? 0,
    tax: item?.gst ?? item?.tax ?? 0,
    quantity: item?.quantity ?? 0,
    serial: item?.serial || '',
    cost_price: item?.cost_price ?? 0,
    item_type: item?.item_type ?? '',
    is_special: item?.is_special ?? '0',
    special_status: item?.special_status || '',
    is_accessory: item?.is_accessory ?? false,
  }));

  if (Array.isArray(detail?.items)) return normalizeItems(detail.items);
  const fromDetail = detail?.line_items || detail?.summary?.line_items;
  const fromList = inv?.line_items || inv?.summary?.line_items;
  return Array.isArray(fromDetail) ? fromDetail : (Array.isArray(fromList) ? fromList : []);
}

function isDepositLine(lineItem) {
  return /deposit/i.test(String(lineItem?.name || ''));
}

function isProductLine(lineItem) {
  const itemType = Number(lineItem?.item_type || 0);
  return !!String(lineItem?.sku || lineItem?.upc || '').trim() || itemType === 1 || itemType === 10;
}

function isSpecialOrderLine(lineItem) {
  return Number(lineItem?.item_type || 0) === 10;
}

function isRepairServiceLine(lineItem) {
  return !isProductLine(lineItem) && !isDepositLine(lineItem) && !!String(lineItem?.name || '').trim();
}

function isDepositOnlyInvoice(inv, detail = null) {
  const lineItems = getInvoiceLineItems(inv, detail);
  const meaningful = lineItems.filter((lineItem) => {
    const qty = Number(lineItem?.quantity || 0);
    const price = parseMoney(lineItem?.price || 0);
    return qty !== 0 || price !== 0 || String(lineItem?.name || '').trim();
  });
  if (!meaningful.length) return false;
  return meaningful.every((lineItem) => isDepositLine(lineItem));
}

function getPaymentAmount(payment) {
  return round2(parseMoney(
    payment?.amount ??
    payment?.payment_amount ??
    payment?.paid_amount ??
    payment?.total_amount ??
    payment?.amount_paid ??
    payment?.value ??
    0
  ));
}

function getPaymentTimestamp(payment) {
  const rawValue = payment?.payment_date ?? payment?.created_at ?? payment?.date ?? payment?.timestamp ?? 0;
  const asNumber = Number(rawValue);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
  const parsed = Date.parse(rawValue);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function normalizePaymentMethod(rawName) {
  const original = String(rawName || '').trim();
  const lowered = original.toLowerCase();
  if (!lowered) return 'Other';
  if (/^cash$/i.test(original)) return 'Cash';
  if (/^(debit|interac|debit\/interac)$/i.test(original)) return 'Debit/Interac';
  if (/^(mastercard|master card)$/i.test(original)) return 'Mastercard';
  if (/^visa$/i.test(original)) return 'Visa';
  if (/^(amex|american express)$/i.test(original)) return 'Amex';
  if (lowered.includes('store credit')) return 'Store Credits';
  if (lowered.includes('e-transfer') || lowered.includes('etransfer')) return 'eTransfer';
  return original;
}

function getPaymentMethodName(payment) {
  return normalizePaymentMethod(
    payment?.payment_method ||
    payment?.method ||
    payment?.method_name ||
    payment?.payment_type ||
    payment?.gateway ||
    payment?.title ||
    payment?.name ||
    'Other'
  );
}

function paymentMethodSort(entries) {
  const priority = ['Cash', 'Debit/Interac', 'Mastercard', 'Visa', 'Amex'];
  return entries.sort(([left], [right]) => {
    const leftIndex = priority.indexOf(left);
    const rightIndex = priority.indexOf(right);
    if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
    if (leftIndex !== -1) return -1;
    if (rightIndex !== -1) return 1;
    return left.localeCompare(right);
  });
}

function buildPaymentBreakdown(payments, fromUnix, toUnix) {
  const inRange = [];
  const methodTotals = Object.create(null);
  let total = 0;

  for (const payment of payments) {
    const paymentDate = getPaymentTimestamp(payment);
    const amount = getPaymentAmount(payment);
    if (!paymentDate || amount === 0) continue;
    if (paymentDate < fromUnix || paymentDate > toUnix) continue;
    const method = getPaymentMethodName(payment);
    inRange.push({ paymentDate, amount, method });
    methodTotals[method] = round2((methodTotals[method] || 0) + amount);
    total = round2(total + amount);
  }

  const sortedTotals = Object.fromEntries(paymentMethodSort(Object.entries(methodTotals)).filter(([, amount]) => amount !== 0));
  return { inRange, methodTotals: sortedTotals, total };
}

function buildDepositCarryoverBreakdown(payments, fromDate, toDate) {
  const methodTotals = Object.create(null);
  let total = 0;

  for (const payment of payments) {
    const paymentDate = getPaymentTimestamp(payment);
    const amount = getPaymentAmount(payment);
    if (!paymentDate || amount === 0) continue;
    const method = getPaymentMethodName(payment);
    if (!isMonerisGoMethod(method)) continue;
    const depositIso = nextBusinessIsoFromUnix(paymentDate);
    if (depositIso < fromDate || depositIso > toDate) continue;
    methodTotals[method] = round2((methodTotals[method] || 0) + amount);
    total = round2(total + amount);
  }

  const sortedTotals = Object.fromEntries(paymentMethodSort(Object.entries(methodTotals)).filter(([, amount]) => amount !== 0));
  return { methodTotals: sortedTotals, total };
}

function nextBusinessIsoFromUnix(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isMonerisGoMethod(methodName) {
  return /moneris\s*go/i.test(String(methodName || ''));
}

function loadConsignmentRules() {
  try {
    if (!fs.existsSync(CONSIGNMENT_RULES_PATH)) {
      return DEFAULT_CONSIGNMENT_RULES;
    }
    const saved = JSON.parse(fs.readFileSync(CONSIGNMENT_RULES_PATH, 'utf8'));
    return {
      vendorKeywords: Array.isArray(saved?.vendorKeywords) ? saved.vendorKeywords : DEFAULT_CONSIGNMENT_RULES.vendorKeywords,
      skuVendors: saved?.skuVendors && typeof saved.skuVendors === 'object' ? saved.skuVendors : DEFAULT_CONSIGNMENT_RULES.skuVendors,
      serialVendors: saved?.serialVendors && typeof saved.serialVendors === 'object' ? saved.serialVendors : DEFAULT_CONSIGNMENT_RULES.serialVendors,
    };
  } catch (e) {
    console.log('[CONFIG] Could not read consignment-rules.json:', e.message);
    return DEFAULT_CONSIGNMENT_RULES;
  }
}

function getConsignmentVendor({ supplier = '', sku = '', serial = '' } = {}) {
  const normalizedSerial = String(serial || '').trim().toUpperCase();
  if (normalizedSerial) {
    for (const [serialRule, vendor] of Object.entries(consignmentRules.serialVendors || {})) {
      if (String(serialRule || '').trim().toUpperCase() === normalizedSerial) return String(vendor || '').trim();
    }
  }

  const normalizedSku = String(sku || '').trim().toLowerCase();
  if (normalizedSku) {
    for (const [skuRule, vendor] of Object.entries(consignmentRules.skuVendors || {})) {
      if (String(skuRule || '').trim().toLowerCase() === normalizedSku) return String(vendor || '').trim();
    }
  }

  const normalizedSupplier = String(supplier || '').trim().toLowerCase();
  if (normalizedSupplier) {
    const matchedKeyword = (consignmentRules.vendorKeywords || []).find((vendor) => {
      const normalizedVendor = String(vendor || '').trim().toLowerCase();
      return normalizedVendor && (normalizedSupplier === normalizedVendor || normalizedSupplier.includes(normalizedVendor));
    });
    if (matchedKeyword) return String(supplier || '').trim();
  }

  return '';
}

function getAllPaymentTotal(payments, fallbackAmountPaid) {
  const totalFromPayments = round2(payments.reduce((sum, payment) => sum + getPaymentAmount(payment), 0));
  if (totalFromPayments !== 0) return totalFromPayments;
  return round2(fallbackAmountPaid);
}

function allocateAmount(value, ratio) {
  return round2(parseMoney(value) * ratio);
}

function lineSubtotal(lineItem) {
  return round2(parseMoney(lineItem?.price || 0) * Number(lineItem?.quantity || 0));
}

function lineTaxAmount(lineItem, fallbackTaxForValue = null) {
  const explicitTax = parseMoney(lineItem?.tax ?? lineItem?.gst ?? 0);
  if (explicitTax !== 0) return round2(explicitTax);
  if (typeof fallbackTaxForValue === 'function') {
    return round2(fallbackTaxForValue(lineSubtotal(lineItem)));
  }
  return 0;
}

function buildInvoiceTaxAllocator(summary, lineItems) {
  const invoiceTotal = parseMoney(summary.total || 0);
  const invoiceTax = parseMoney(summary.total_tax || 0);
  const taxableBase = round2(lineItems.reduce((sum, lineItem) => sum + lineSubtotal(lineItem), 0));
  const denominator = taxableBase || (invoiceTotal - invoiceTax);
  const taxRate = denominator !== 0 ? invoiceTax / denominator : 0;
  return (value) => round2(value * taxRate);
}

function isNoPartExpectedRepair(repairName) {
  return /diagnostic|support/i.test(String(repairName || ''));
}

function buildExactProductPaymentMatchMap(lineItems, inRangePayments, taxForValue) {
  const productEntries = lineItems
    .map((lineItem, index) => ({ lineItem, index }))
    .filter(({ lineItem }) => isProductLine(lineItem) && !isDepositLine(lineItem))
    .map(({ lineItem, index }) => ({
      index,
      total: round2(lineSubtotal(lineItem) + lineTaxAmount(lineItem, taxForValue)),
      matched: false,
    }));

  if (!productEntries.length || !inRangePayments.length) return null;

  const matchMap = new Map();
  for (const payment of inRangePayments) {
    const amount = round2(payment.amount);
    const candidate = productEntries.find((entry) => !entry.matched && round2(entry.total) === amount);
    if (!candidate) {
      return null;
    }
    candidate.matched = true;
    matchMap.set(candidate.index, 1);
  }

  if (!matchMap.size) return null;
  return matchMap;
}

function normalizeCategoryValue(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesExactCategoryRule(value, rules) {
  const normalizedValue = normalizeCategoryValue(value);
  if (!normalizedValue) return false;
  return rules.some((rule) => normalizedValue === normalizeCategoryValue(rule));
}

function matchesPrefixCategoryRule(value, rules) {
  const normalizedValue = normalizeCategoryValue(value);
  if (!normalizedValue) return false;
  return rules.some((rule) => {
    const normalizedRule = normalizeCategoryValue(rule);
    return normalizedValue === normalizedRule || normalizedValue.startsWith(normalizedRule);
  });
}

function getExactCategoryBucket(value) {
  const normalizedValue = normalizeCategoryValue(value);
  if (!normalizedValue) return '';
  for (const [categoryName, bucket] of Object.entries(categoryRules.exactCategoryBucket || {})) {
    if (normalizeCategoryValue(categoryName) === normalizedValue) {
      return String(bucket || '').toLowerCase();
    }
  }
  return '';
}

function getDisplayTopLevelForCategory(value) {
  const normalizedValue = normalizeCategoryValue(value);
  if (!normalizedValue) return '';
  for (const [categoryName, topLevel] of Object.entries(categoryRules.displayTopLevelByCategory || {})) {
    if (normalizeCategoryValue(categoryName) === normalizedValue) {
      return String(topLevel || '').trim();
    }
  }
  return '';
}

function getTopCategoryName(invItem) {
  const categories = Array.isArray(invItem?.categories) ? invItem.categories.map((entry) => String(entry?.name || '').trim()).filter(Boolean) : [];
  if (categories.length) return categories[0];
  return String(invItem?.category_name || '').trim();
}

function classifyInventoryItem(invItem, lineItemName = '') {
  const topCategory = getTopCategoryName(invItem);
  const categoryChain = getCategoryChain(invItem);
  const categoryName = String(invItem?.category_name || '').trim();

  const exactBucket =
    getExactCategoryBucket(categoryName) ||
    categoryChain.map(getExactCategoryBucket).find(Boolean) ||
    getExactCategoryBucket(topCategory);
  if (exactBucket === 'retail' || exactBucket === 'devices') return exactBucket;

  if (matchesExactCategoryRule(topCategory, categoryRules.retailTopLevels)) return 'retail';
  if (matchesExactCategoryRule(topCategory, categoryRules.deviceTopLevels)) return 'devices';

  if (categoryChain.some((entry) => matchesPrefixCategoryRule(entry, categoryRules.retailCategoryPrefixes))) return 'retail';
  if (categoryChain.some((entry) => matchesExactCategoryRule(entry, categoryRules.deviceCategoryPrefixes))) return 'devices';

  if (matchesPrefixCategoryRule(categoryName, categoryRules.retailCategoryPrefixes)) return 'retail';
  if (matchesExactCategoryRule(categoryName, categoryRules.deviceCategoryPrefixes)) {
    const hasSerializedSignal = !!(invItem?.is_serialize || invItem?.device_id || String(invItem?.serial || '').trim());
    if (hasSerializedSignal) return 'devices';
  }

  const fallbackName = String(lineItemName || '').toLowerCase();
  if (/\b(case|cable|charger|protector|storage|software|mount|keyboard|mouse|headphone|webcam|adapter|dongle)\b/.test(fallbackName)) {
    return 'retail';
  }
  if (/\b(imac|macbook air|macbook pro|mac mini|iphone \d|iphone se|ipad|apple watch|windows laptop|windows desktop|chromebook)\b/.test(fallbackName)) {
    return 'devices';
  }
  return 'retail';
}

function buildDisplayCategoryChain(invItem, bucket) {
  const categories = getCategoryChain(invItem);
  if (categories.length >= 2) return categories;

  const categoryName = String(invItem?.category_name || '').trim();
  const topCategory = getTopCategoryName(invItem);
  const displayTopLevel =
    getDisplayTopLevelForCategory(categoryName) ||
    categories.map(getDisplayTopLevelForCategory).find(Boolean) ||
    getDisplayTopLevelForCategory(topCategory);
  if (categories.length === 1 && normalizeCategoryValue(categories[0]) === normalizeCategoryValue(topCategory)) {
    if (displayTopLevel && normalizeCategoryValue(displayTopLevel) !== normalizeCategoryValue(categories[0])) {
      return [displayTopLevel, categories[0]];
    }
    return categories;
  }

  if (bucket === 'devices') {
    const inferredTop = displayTopLevel || (categoryName && matchesExactCategoryRule(categoryName, categoryRules.deviceCategoryPrefixes)
      ? 'Devices'
      : (matchesExactCategoryRule(topCategory, categoryRules.deviceTopLevels) ? topCategory : ''));
    if (inferredTop && categoryName && normalizeCategoryValue(categoryName) !== normalizeCategoryValue(inferredTop)) {
      return [inferredTop, categoryName];
    }
  }

  if (bucket === 'retail') {
    const inferredTop = displayTopLevel || (matchesExactCategoryRule(topCategory, categoryRules.retailTopLevels)
      ? topCategory
      : (matchesPrefixCategoryRule(categoryName, categoryRules.retailCategoryPrefixes) ? 'Accessories' : ''));
    if (inferredTop && categoryName && normalizeCategoryValue(categoryName) !== normalizeCategoryValue(inferredTop)) {
      return [inferredTop, categoryName];
    }
  }

  return categories.length ? categories : (categoryName ? [categoryName] : []);
}

function getCategoryChain(invItem) {
  const categories = Array.isArray(invItem?.categories) ? invItem.categories.map((entry) => String(entry?.name || '').trim()).filter(Boolean) : [];
  if (categories.length) return categories;
  if (invItem?.category_name) return [String(invItem.category_name)];
  return [];
}

function extractRepairParts(ticketDetail) {
  const devices = Array.isArray(ticketDetail?.devices) ? ticketDetail.devices : [];
  const topLevelParts = Array.isArray(ticketDetail?.parts) ? ticketDetail.parts : [];
  const rawParts = [
    ...devices.flatMap((device) => (Array.isArray(device.parts) ? device.parts : [])),
    ...topLevelParts,
  ].filter((part) => part && !/deposit/i.test(String(part?.name || '')));

  const seen = new Set();
  return rawParts.filter((part) => {
    const key = [
      part.id || '',
      part.name || '',
      part.sku || '',
      part.crossId || '',
      part.quantity || 1,
      part.price || '',
      part.cost_price || '',
      part.cost || '',
      part.unit_cost || '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolvePartCost(part, inventoryBySku, partsBySku) {
  const sku = String(part?.sku || '').trim().toLowerCase();
  const inventoryItem = sku ? (inventoryBySku[sku] || partsBySku[sku] || null) : null;
  const isSpecial = part?.is_special === '1' || part?.is_special === 1;
  const rawCost =
    part?.cost_price ??
    part?.cost ??
    part?.unit_cost ??
    part?.price_cost ??
    part?.purchase_price ??
    part?.costPrice ??
    part?.part_cost ??
    part?.cost_per_unit ??
    (isSpecial ? part?.price : undefined) ??
    inventoryItem?.prices?.cost_price ??
    inventoryItem?.cost_price ??
    inventoryItem?.cost ??
    inventoryItem?.purchase_price ??
    0;

  return {
    sku: String(part?.sku || '').trim(),
    cost: round2(parseMoney(rawCost)),
    retail: round2(parseMoney(part?.retail_price ?? part?.price ?? inventoryItem?.price ?? inventoryItem?.original_price ?? 0)),
    isSpecial,
  };
}

function buildRepairItemsForAudit(ticketDetail) {
  const devices = Array.isArray(ticketDetail?.devices) ? ticketDetail.devices : [];
  return devices.map((device) => {
    const parts = Array.isArray(device.parts) ? device.parts : [];
    return {
      repairName: device.name || '',
      deviceName: device.device?.name || device.device_name || '',
      status: device.status?.name || device.status || '',
      hasParts: parts.length > 0,
      partsCount: parts.length,
      parts: parts.map((part) => ({
        name: part.name || part.part_name || '',
        quantity: Number(part.quantity || part.qty || 1),
        sku: part.sku || part.upc || '',
        supplier: part.supplier_name || part.supplier || '',
      })),
    };
  });
}

async function fetchInventoryMatchesForSkus(skus, inventoryBySku) {
  for (const sku of skus) {
    if (!sku) continue;
    const normalizedSku = sku.toLowerCase();
    if (inventoryCacheBySku[normalizedSku]) {
      inventoryBySku[normalizedSku] = inventoryCacheBySku[normalizedSku];
      continue;
    }
    if (inventoryBySku[normalizedSku]) continue;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await rdPublic('inventory', { pagesize: 10, page: 0, keyword: sku });
        const raw = parseJsonSafe(response.body);
        const items = raw?.data?.inventoryListData || [];
        for (const item of items) {
          if (item?.sku) {
            inventoryBySku[item.sku.trim().toLowerCase()] = item;
            inventoryCacheBySku[item.sku.trim().toLowerCase()] = item;
          }
          if (item?.item_no) {
            inventoryBySku[item.item_no.trim().toLowerCase()] = item;
            inventoryCacheBySku[item.item_no.trim().toLowerCase()] = item;
          }
        }
        if (!inventoryBySku[normalizedSku] && items.length) {
          inventoryBySku[normalizedSku] = items[0];
          inventoryCacheBySku[normalizedSku] = items[0];
        }
        break;
      } catch (e) {
        console.log(`[INV] Inventory lookup failed for SKU=${sku} attempt=${attempt}: ${e.message}`);
        await sleep(200 * attempt);
      }
    }
  }
}

async function fetchInventoryDetailById(itemId) {
  const key = String(itemId || '').trim();
  if (!key) return null;
  if (inventoryCacheById[key]) return inventoryCacheById[key];

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await rdPublic(`inventory/${key}`);
      const raw = parseJsonSafe(response.body);
      const item = raw?.data || null;
      if (response.status === 200 && item?.id) {
        inventoryCacheById[key] = item;
        if (item?.sku) inventoryCacheBySku[item.sku.trim().toLowerCase()] = item;
        if (item?.item_no) inventoryCacheBySku[item.item_no.trim().toLowerCase()] = item;
        return item;
      }
    } catch (e) {
      console.log(`[INV] Inventory detail failed for id=${key} attempt=${attempt}: ${e.message}`);
      await sleep(200 * attempt);
    }
  }

  return null;
}

async function fetchPartsCatalog() {
  const partsBySku = Object.create(null);
  try {
    const response = await rdPublic('parts', { pagesize: 200, page: 0 });
    const raw = parseJsonSafe(response.body);
    const parts = Object.values(raw?.data || {});
    for (const part of parts) {
      if (part?.sku) partsBySku[part.sku.trim().toLowerCase()] = part;
      if (part?.item_no) partsBySku[part.item_no.trim().toLowerCase()] = part;
    }
  } catch (e) {
    console.log('[PARTS] Could not fetch parts catalog:', e.message);
  }
  return partsBySku;
}

async function buildDashboardData(fromDate, toDate) {
  const fromUnix = dateToUnixStart(fromDate);
  const toUnix = dateToUnixEnd(toDate);
  const lookbackUnix = fromUnix - (LOOKBACK_DAYS * 86400);
  const timer = createTimer(`DASH ${fromDate}..${toDate}`);

  console.log(`[DASH] Building dashboard for ${fromDate} -> ${toDate}`);

  const createdRangeInvoices = await fetchPaginated(
    'invoices',
    { from_date: fromUnix, to_date: toUnix },
    (raw) => raw.data?.invoiceData || [],
    12
  );
  timer.phase('created-range invoices', `count=${createdRangeInvoices.length}`);

  const olderCandidateInvoices = await fetchPaginated(
    'invoices',
    { from_date: lookbackUnix, to_date: fromUnix - 1 },
    (raw) => raw.data?.invoiceData || [],
    Number.POSITIVE_INFINITY
  );
  timer.phase('lookback invoices', `count=${olderCandidateInvoices.length}`);

  const paymentCandidateMap = new Map();
  for (const invoice of createdRangeInvoices) {
    const summary = getInvoiceSummary(invoice);
    const amountPaid = parseMoney(summary.amount_paid || 0);
    if (amountPaid === 0 && !String(summary.payment_methods || '').trim()) continue;
    paymentCandidateMap.set(String(summary.id), invoice);
  }

  for (const invoice of olderCandidateInvoices) {
    const summary = getInvoiceSummary(invoice);
    const amountPaid = parseMoney(summary.amount_paid || 0);
    const status = String(summary.status || '').toLowerCase();
    const hasMethodHint = !!String(summary.payment_methods || '').trim();
    if (amountPaid === 0) continue;
    if (!['paid', 'refund'].includes(status) || !hasMethodHint) continue;
    paymentCandidateMap.set(String(summary.id), invoice);
  }

  const paymentScopedInvoices = [];
  const paymentMethods = Object.create(null);
  const depositCarryoverMethods = Object.create(null);
  const paymentContextByInvoiceId = Object.create(null);

  const paymentCandidates = [...paymentCandidateMap.values()];
  const DETAIL_BATCH = 2;
  for (let index = 0; index < paymentCandidates.length; index += DETAIL_BATCH) {
    const batch = paymentCandidates.slice(index, index + DETAIL_BATCH);
    const results = await Promise.all(batch.map(async (invoice) => {
      const summary = getInvoiceSummary(invoice);
      const detail = await fetchInvoiceDetail(summary.id);
      if (!detail) return null;
      const payments = Array.isArray(detail.summary?.payments) ? detail.summary.payments : [];
      const inRange = buildPaymentBreakdown(payments, fromUnix, toUnix);
      const carryover = buildDepositCarryoverBreakdown(payments, fromDate, toDate);
      const totalPayments = getAllPaymentTotal(payments, summary.amount_paid);
      const ratio = clamp(Math.abs(totalPayments) > 0 ? (inRange.total / totalPayments) : 0, 0, 1);
      return { invoice, detail, paymentRange: inRange, carryoverRange: carryover, ratio, totalPayments };
    }));

    for (const result of results.filter(Boolean)) {
      for (const [method, amount] of Object.entries(result.carryoverRange?.methodTotals || {})) {
        depositCarryoverMethods[method] = round2((depositCarryoverMethods[method] || 0) + amount);
      }
      if (result.paymentRange.total !== 0) {
        const invoiceId = String(getInvoiceSummary(result.invoice).id);
        paymentScopedInvoices.push(result.invoice);
        paymentContextByInvoiceId[invoiceId] = result;
        for (const [method, amount] of Object.entries(result.paymentRange.methodTotals)) {
          paymentMethods[method] = round2((paymentMethods[method] || 0) + amount);
        }
      }
    }
    await sleep(150);
  }
  timer.phase('payment invoice details', `candidates=${paymentCandidates.length} matched=${paymentScopedInvoices.length}`);

  const sortedPaymentMethods = Object.fromEntries(paymentMethodSort(Object.entries(paymentMethods)).filter(([, amount]) => amount !== 0));
  const sortedDepositCarryoverMethods = Object.fromEntries(paymentMethodSort(Object.entries(depositCarryoverMethods)).filter(([, amount]) => amount !== 0));
  const paymentTotal = round2(Object.values(sortedPaymentMethods).reduce((sum, amount) => sum + amount, 0));
  const depositCarryoverTotal = round2(Object.values(sortedDepositCarryoverMethods).reduce((sum, amount) => sum + amount, 0));
  const paymentTaxTotal = round2(paymentScopedInvoices.reduce((sum, invoice) => {
    const summary = getInvoiceSummary(invoice);
    const context = paymentContextByInvoiceId[String(summary.id)];
    const ratio = context?.ratio || 0;
    return sum + allocateAmount(parseMoney(summary.total_tax || 0), ratio);
  }, 0));

  const repairAuditInvoices = createdRangeInvoices.filter((invoice) => {
    const summary = getInvoiceSummary(invoice);
    return summary.ticket?.hasTicket && summary.ticket?.id && !isDepositOnlyInvoice(invoice);
  });

  const ticketRequirements = new Map();
  for (const invoice of [...paymentScopedInvoices, ...repairAuditInvoices]) {
    const summary = getInvoiceSummary(invoice);
    if (!summary.ticket?.hasTicket || !summary.ticket?.id) continue;
    ticketRequirements.set(String(summary.ticket.id), {
      ticketId: summary.ticket.id,
      ticketNum: summary.ticket.order_id || '',
    });
  }

  const ticketDetailsByInternalId = Object.create(null);
  for (const requirement of ticketRequirements.values()) {
    const detail = await fetchTicketDetailRobust(requirement.ticketId, requirement.ticketNum);
    if (detail) ticketDetailsByInternalId[String(requirement.ticketId)] = detail;
  }
  timer.phase('ticket details', `requested=${ticketRequirements.size} cached=${Object.keys(ticketDetailCacheByInternalId).length}`);

  const invoiceDetailsForSkuScan = Object.create(null);
  for (const invoice of createdRangeInvoices) {
    const summary = getInvoiceSummary(invoice);
    invoiceDetailsForSkuScan[String(summary.id)] =
      paymentContextByInvoiceId[String(summary.id)]?.detail || await fetchInvoiceDetail(summary.id);
  }
  timer.phase('created-range invoice details', `count=${Object.keys(invoiceDetailsForSkuScan).length}`);

  const invoiceSkuSet = new Set();
  for (const invoice of [...paymentScopedInvoices, ...createdRangeInvoices]) {
    const detail =
      paymentContextByInvoiceId[String(getInvoiceSummary(invoice).id)]?.detail ||
      invoiceDetailsForSkuScan[String(getInvoiceSummary(invoice).id)] ||
      null;
    for (const lineItem of getInvoiceLineItems(invoice, detail)) {
      const sku = String(lineItem?.sku || lineItem?.upc || '').trim();
      if (sku) invoiceSkuSet.add(sku);
    }
  }

  const repairPartSkuSet = new Set();
  for (const ticketDetail of Object.values(ticketDetailsByInternalId)) {
    for (const part of extractRepairParts(ticketDetail)) {
      const sku = String(part?.sku || '').trim();
      if (sku) repairPartSkuSet.add(sku);
    }
  }

  const inventoryBySku = Object.create(null);
  await fetchInventoryMatchesForSkus([...invoiceSkuSet, ...repairPartSkuSet], inventoryBySku);
  const partsBySku = await fetchPartsCatalog();
  timer.phase('inventory and parts enrichment', `invoiceSkus=${invoiceSkuSet.size} repairPartSkus=${repairPartSkuSet.size} inventoryHits=${Object.keys(inventoryBySku).length} partsHits=${Object.keys(partsBySku).length}`);

  const salesRepairs = [];
  const salesRetail = [];
  const salesDevices = [];
  const salesConsignment = [];
  const salesSpecialOrders = [];

  for (const invoice of paymentScopedInvoices) {
    const summary = getInvoiceSummary(invoice);
    const invoiceId = String(summary.id);
    const context = paymentContextByInvoiceId[invoiceId];
    if (!context) continue;

    const lineItems = getInvoiceLineItems(invoice, context.detail);
    const taxForValue = buildInvoiceTaxAllocator(summary, lineItems);
    const exactProductPaymentMatchMap = buildExactProductPaymentMatchMap(lineItems, context.paymentRange?.inRange || [], taxForValue);
    const ticketId = summary.ticket?.id ? String(summary.ticket.id) : '';
    const ticketNum = summary.ticket?.order_id || '';
    const ticketDetail = ticketId ? ticketDetailsByInternalId[ticketId] || null : null;
    const ratio = context.ratio;

    if (ticketDetail) {
      const serviceLines = lineItems.filter((lineItem) => isRepairServiceLine(lineItem));
      if (serviceLines.length) {
        const serviceRevenue = round2(serviceLines.reduce((sum, lineItem) => sum + lineSubtotal(lineItem), 0));
        const serviceTax = round2(serviceLines.reduce((sum, lineItem) => sum + taxForValue(lineSubtotal(lineItem)), 0));
        const consumedParts = extractRepairParts(ticketDetail);
        const partRows = consumedParts.map((part) => {
          const resolved = resolvePartCost(part, inventoryBySku, partsBySku);
          return {
            name: part.name || '',
            sku: resolved.sku,
            qty: Number(part.quantity || 1),
            cost: resolved.cost,
            retail: resolved.retail,
            isSpecial: resolved.isSpecial,
          };
        });
        const serviceLineCogs = round2(serviceLines.reduce((sum, lineItem) => {
          const qty = Number(lineItem?.quantity || 1);
          return sum + (parseMoney(lineItem?.cost_price || 0) * qty);
        }, 0));
        const partsDerivedCogs = round2(partRows.reduce((sum, part) => sum + (part.cost * part.qty), 0));
        const fullCogs = serviceLineCogs > 0 ? serviceLineCogs : partsDerivedCogs;
        const allocatedRevenue = allocateAmount(serviceRevenue, ratio);
        const allocatedTax = allocateAmount(serviceTax, ratio);
        const allocatedCogs = allocateAmount(fullCogs, ratio);
        const description = serviceLines.map((lineItem) => lineItem.name).join(', ');
        const devices = Array.isArray(ticketDetail.devices) ? ticketDetail.devices : [];
        const repairCategory = devices.map((device) => device.device?.name || device.device_name || device.name || '').filter(Boolean).join(', ');

        salesRepairs.push({
          invoiceNum: summary.order_id,
          invoiceId: summary.id,
          ticketId,
          ticketNum,
          repairCategory,
          description: description || summary.subject || 'Repair',
          qty: 1,
          revenue: allocatedRevenue,
          tax: allocatedTax,
          total: round2(allocatedRevenue + allocatedTax),
          cogs: allocatedCogs,
          netProfit: round2(allocatedRevenue - allocatedCogs),
          parts: partRows.map((part) => ({
            ...part,
            retail: allocateAmount(part.retail, ratio),
            cost: allocateAmount(part.cost, ratio),
          })),
          source: 'ticket_invoice',
        });
      }
    }

    for (const [lineIndex, lineItem] of lineItems.entries()) {
      if (!isProductLine(lineItem) || isDepositLine(lineItem)) continue;
      const sku = String(lineItem?.sku || lineItem?.upc || '').trim();
      const qty = Number(lineItem?.quantity || 1);
      const gross = lineSubtotal(lineItem);
      const tax = lineTaxAmount(lineItem, taxForValue);
      const revenue = round2(gross);
      const lineRatio = exactProductPaymentMatchMap?.has(lineIndex) ? exactProductPaymentMatchMap.get(lineIndex) : ratio;
      const allocatedRevenue = allocateAmount(revenue, lineRatio);
      const allocatedTax = allocateAmount(tax, lineRatio);
      const normalizedSku = sku.toLowerCase();
      let invItem = inventoryBySku[normalizedSku] || null;
      if (!invItem) {
        invItem = await fetchInventoryDetailById(lineItem?.id);
      }
      const category = classifyInventoryItem(invItem, lineItem?.name || '');
      const serial = String(lineItem?.serial || '').trim();
      let deviceCost = 0;
      let refurbCost = 0;
      if (parseMoney(lineItem?.cost_price || 0) > 0) {
        deviceCost = parseMoney(lineItem.cost_price);
      } else if (invItem) {
        deviceCost = parseMoney(invItem.prices?.cost_price ?? invItem.cost_price ?? 0);
      }
      const signedDeviceCost = round2(deviceCost * qty);
      const signedRefurbCost = round2(refurbCost * qty);
      const cogs = allocateAmount(round2(signedDeviceCost + signedRefurbCost), lineRatio);
      const isSpecialOrder = isSpecialOrderLine(lineItem);
      const consignmentVendor = getConsignmentVendor({
        supplier: invItem?.supplier || '',
        sku,
        serial,
      });
      const item = {
        invoiceNum: summary.order_id,
        invoiceId: summary.id,
        inventoryId: lineItem?.id || invItem?.id || '',
        name: lineItem?.name || '',
        sku,
        serial,
        itemNo: invItem?.item_no || '',
        qty,
        sellPrice: parseMoney(lineItem?.price || 0),
        revenue: allocatedRevenue,
        tax: allocatedTax,
        total: round2(allocatedRevenue + allocatedTax),
        deviceCost: allocateAmount(signedDeviceCost, lineRatio),
        refurbCost: allocateAmount(signedRefurbCost, lineRatio),
        cost: allocateAmount(round2(signedDeviceCost + signedRefurbCost), lineRatio),
        cogs,
        netProfit: round2(allocatedRevenue - cogs),
        isSerialized: !!(invItem?.is_serialize || serial),
        variant: '',
        categoryName: isSpecialOrder ? 'Special Order' : (invItem?.category_name || ''),
        categories: isSpecialOrder
          ? ['Special Orders', String(lineItem?.special_status || 'Pending').trim()].filter(Boolean)
          : buildDisplayCategoryChain(invItem, category),
        manufacturer: invItem?.manufacturer_name || invItem?.manufacturer || '',
        supplier: invItem?.supplier || '',
        consignmentVendor,
        deviceModels: invItem?.compatible_models || '',
        source: isSpecialOrder ? 'special_order_line' : (summary.ticket?.hasTicket ? 'ticket_invoice_line' : 'invoice_line'),
        specialStatus: String(lineItem?.special_status || '').trim(),
      };
      if (isSpecialOrder) salesSpecialOrders.push(item);
      else if (category === 'devices' && consignmentVendor) salesConsignment.push(item);
      else if (category === 'devices') salesDevices.push(item);
      else salesRetail.push(item);
    }
  }

  const paymentScopedInvoiceIds = new Set(Object.keys(paymentContextByInvoiceId));
  for (const invoice of createdRangeInvoices) {
    const summary = getInvoiceSummary(invoice);
    const invoiceId = String(summary.id);
    if (paymentScopedInvoiceIds.has(invoiceId)) continue;

    const detail = invoiceDetailsForSkuScan[invoiceId] || await fetchInvoiceDetail(summary.id);
    const lineItems = getInvoiceLineItems(invoice, detail);
    for (const lineItem of lineItems) {
      if (!isProductLine(lineItem) || isDepositLine(lineItem)) continue;
      const revenue = round2(lineSubtotal(lineItem));
      const explicitCost = parseMoney(lineItem?.cost_price || 0);
      const sku = String(lineItem?.sku || lineItem?.upc || '').trim();
      let invItem = sku ? (inventoryBySku[sku.toLowerCase()] || null) : null;
      if (!invItem) {
        invItem = await fetchInventoryDetailById(lineItem?.id);
      }
      const fallbackCost = parseMoney(invItem?.prices?.cost_price ?? invItem?.cost_price ?? 0);
      const unitCost = explicitCost > 0 ? explicitCost : fallbackCost;
      if (revenue !== 0 || unitCost <= 0) continue;

      const qty = Number(lineItem?.quantity || 1);
      const category = classifyInventoryItem(invItem, lineItem?.name || '');
      const signedUnitCost = round2(unitCost * qty);
      const cogs = signedUnitCost;
      const isSpecialOrder = isSpecialOrderLine(lineItem);
      const consignmentVendor = getConsignmentVendor({
        supplier: invItem?.supplier || '',
        sku,
        serial: String(lineItem?.serial || '').trim(),
      });
      const item = {
        invoiceNum: summary.order_id,
        invoiceId: summary.id,
        inventoryId: lineItem?.id || invItem?.id || '',
        name: lineItem?.name || '',
        sku,
        serial: String(lineItem?.serial || '').trim(),
        itemNo: invItem?.item_no || '',
        qty,
        sellPrice: parseMoney(lineItem?.price || 0),
        revenue: 0,
        tax: 0,
        total: 0,
        deviceCost: signedUnitCost,
        refurbCost: 0,
        cost: signedUnitCost,
        cogs,
        netProfit: round2(-cogs),
        isSerialized: !!(invItem?.is_serialize || lineItem?.serial),
        variant: '',
        categoryName: isSpecialOrder ? 'Special Order' : (invItem?.category_name || ''),
        categories: isSpecialOrder
          ? ['Special Orders', String(lineItem?.special_status || 'Pending').trim()].filter(Boolean)
          : buildDisplayCategoryChain(invItem, category),
        manufacturer: invItem?.manufacturer_name || invItem?.manufacturer || '',
        supplier: invItem?.supplier || '',
        consignmentVendor,
        deviceModels: invItem?.compatible_models || '',
        source: isSpecialOrder ? 'complimentary_special_order' : 'complimentary_item',
        specialStatus: String(lineItem?.special_status || '').trim(),
      };
      if (isSpecialOrder) salesSpecialOrders.push(item);
      else if (category === 'devices' && consignmentVendor) salesConsignment.push(item);
      else if (category === 'devices') salesDevices.push(item);
      else salesRetail.push(item);
    }
  }

  const auditResults = [];
  for (const invoice of repairAuditInvoices) {
    const summary = getInvoiceSummary(invoice);
    const ticketId = String(summary.ticket?.id || '');
    const ticketDetail = ticketDetailsByInternalId[ticketId] || null;
    const lineItems = getInvoiceLineItems(invoice);
    const taxForValue = buildInvoiceTaxAllocator(summary, lineItems);
    const serviceLines = lineItems.filter((lineItem) => isRepairServiceLine(lineItem));
    const productLines = lineItems.filter((lineItem) => isProductLine(lineItem) && !isDepositLine(lineItem));
    const depositLines = lineItems.filter((lineItem) => isDepositLine(lineItem));
    const serviceRevenue = round2(serviceLines.reduce((sum, lineItem) => sum + lineSubtotal(lineItem), 0));
    const productRevenue = round2(productLines.reduce((sum, lineItem) => sum + lineSubtotal(lineItem), 0));
    const fullTax = round2(lineItems.reduce((sum, lineItem) => sum + taxForValue(lineSubtotal(lineItem)), 0));
    const amountPaid = parseMoney(summary.amount_paid || 0);
    const amountDue = parseMoney(summary.amount_due || 0);
    const repairItems = ticketDetail ? buildRepairItemsForAudit(ticketDetail) : [];
    const nonDiagnosticItems = repairItems.filter((item) => !isNoPartExpectedRepair(item.repairName));
    const isDiagnosticOnly = repairItems.length > 0 && repairItems.every((item) => isNoPartExpectedRepair(item.repairName));
    const anyMissingParts = !!(ticketDetail && nonDiagnosticItems.some((item) => !item.hasParts));

    auditResults.push({
      ticketId: summary.ticket?.order_id || null,
      ticketNum: summary.ticket?.order_id || null,
      internalTicketId: ticketId || null,
      invoiceNums: summary.order_id || '—',
      invoices: [{
        invoiceId: summary.id,
        invoiceNum: summary.order_id,
        ticketNum: summary.ticket?.order_id || null,
        amountPaid,
        total: round2(parseMoney(summary.total || 0)),
        isDeposit: false,
        createdDate: summary.created_date,
        createdDateIso: fromDate,
        lineItems: lineItems.map((lineItem) => ({
          name: lineItem?.name || '',
          price: parseMoney(lineItem?.price || 0),
          quantity: Number(lineItem?.quantity || 0),
          sku: lineItem?.sku || lineItem?.upc || '',
        })),
      }],
      customer: summary.customer?.fullName || '—',
      createdBy: typeof summary.created_by === 'string' ? summary.created_by : (summary.created_by?.fullname || '—'),
      totalPaid: amountPaid,
      amountDue,
      paymentStatus: amountDue > 0 ? (amountPaid > 0 ? 'deposit' : 'owing') : 'paid',
      isDepositOnly: false,
      isDiagnosticOnly,
      repairItems,
      retailItems: productLines.map((lineItem) => ({
        name: lineItem?.name || '',
        quantity: Number(lineItem?.quantity || 0),
        total: lineSubtotal(lineItem),
      })),
      anyMissingParts,
      partsError: ticketDetail ? null : 'Ticket detail unavailable',
      invoiceDate: fromDate,
      serviceRevenue,
      productRevenue,
      tax: fullTax,
      depositApplied: round2(depositLines.reduce((sum, lineItem) => sum + lineSubtotal(lineItem), 0)),
    });
  }

  auditResults.sort((left, right) => {
    if (left.anyMissingParts && !right.anyMissingParts) return -1;
    if (!left.anyMissingParts && right.anyMissingParts) return 1;
    return Number(right.ticketNum || 0) - Number(left.ticketNum || 0);
  });

  const auditMissingCount = auditResults.filter((item) => item.anyMissingParts).length;
  const auditClearCount = auditResults.filter((item) => !item.anyMissingParts && !item.partsError).length;

  const totalRepairRevenue = round2(salesRepairs.reduce((sum, item) => sum + item.revenue, 0));
  const totalRepairCogs = round2(salesRepairs.reduce((sum, item) => sum + item.cogs, 0));
  const totalProductRevenue = round2([...salesRetail, ...salesDevices, ...salesSpecialOrders].reduce((sum, item) => sum + item.revenue, 0));
  const totalProductCogs = round2([...salesRetail, ...salesDevices, ...salesSpecialOrders].reduce((sum, item) => sum + item.cogs, 0));
  const totalRevenue = round2(totalRepairRevenue + totalProductRevenue);
  const totalCost = round2(totalRepairCogs + totalProductCogs);
  const totalTax = round2([
    ...salesRepairs,
    ...salesRetail,
    ...salesDevices,
    ...salesSpecialOrders,
  ].reduce((sum, item) => sum + (item.tax || 0), 0));
  timer.phase(
    'assembled payload',
    `repairs=${salesRepairs.length} retail=${salesRetail.length} devices=${salesDevices.length} special=${salesSpecialOrders.length} audit=${auditResults.length}`
  );
  timer.done(`paymentTotal=${paymentTotal}`);

  return {
    payments: {
      methods: sortedPaymentMethods,
      total: paymentTotal,
      depositCarryoverMethods: sortedDepositCarryoverMethods,
      depositCarryoverTotal,
    },
    audit: {
      invoices: auditResults,
      total: auditResults.length,
      missingParts: auditMissingCount,
      clear: auditClearCount,
    },
    sales: {
      repairs: salesRepairs,
      retail: salesRetail,
      devices: salesDevices,
      consignment: salesConsignment,
      specialOrders: salesSpecialOrders,
      paymentMethods: sortedPaymentMethods,
      summary: {
        totalRevenue,
        totalCost,
        grossProfit: round2(totalRevenue - totalCost),
        netProfitAfterTax: round2(paymentTotal - paymentTaxTotal - totalCost),
        repairRevenue: totalRepairRevenue,
        repairCogs: totalRepairCogs,
        productRevenue: totalProductRevenue,
        productCogs: totalProductCogs,
        specialOrderRevenue: round2(salesSpecialOrders.reduce((sum, item) => sum + item.revenue, 0)),
        specialOrderCogs: round2(salesSpecialOrders.reduce((sum, item) => sum + item.cogs, 0)),
        invoiceRevenue: paymentTotal,
        invoiceTax: paymentTaxTotal,
        lineItemTax: totalTax,
      },
    },
  };
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  const pathname = requestUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    try {
      let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      html = html.replace(
        /One Bite Technology Daily Report(?!\s*—\s*v)/,
        `One Bite Technology Daily Report — ${APP_VERSION}`
      );
      html = html.replace(/__APP_VERSION__/g, APP_VERSION);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500);
      res.end('Could not load index.html');
    }
    return;
  }

  if (pathname === '/ticket-display' || pathname === '/ticket-display.html') {
    try {
      let html = fs.readFileSync(path.join(__dirname, 'ticket-display.html'), 'utf8');
      html = html.replace(/__APP_VERSION__/g, APP_VERSION);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500);
      res.end('Could not load ticket-display.html');
    }
    return;
  }

  if (pathname === '/api/config' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { apiKey, ticketCounterToken, ticketCounterDisplayUrl, rushSyncEnabled, rushSyncCookie } = JSON.parse(body);
      if (apiKey !== undefined) sessionConfig.apiKey = String(apiKey || '').trim();
      if (ticketCounterDisplayUrl !== undefined) sessionConfig.ticketCounterDisplayUrl = String(ticketCounterDisplayUrl || '').trim();
      if (ticketCounterToken !== undefined) sessionConfig.ticketCounterToken = String(ticketCounterToken || '').trim();
      if (!sessionConfig.rushSync || typeof sessionConfig.rushSync !== 'object') {
        sessionConfig.rushSync = { enabled: false, cookie: '' };
      }
      if (rushSyncEnabled !== undefined) sessionConfig.rushSync.enabled = !!rushSyncEnabled;
      if (rushSyncCookie !== undefined) sessionConfig.rushSync.cookie = normalizeRushSyncCookie(rushSyncCookie);
      rushSyncCache = {
        fetchedAt: 0,
        origin: '',
        cookie: '',
        map: Object.create(null),
        status: emptyRushSyncStatus(),
      };
      saveConfig(sessionConfig);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: 'RepairDesk settings saved' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/config' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const ticketCounterConnection = getTicketCounterConnection();
    res.end(JSON.stringify({
      apiKey: getConfiguredApiKey(),
      ticketCounterDisplayUrl: String(sessionConfig?.ticketCounterDisplayUrl || '').trim(),
      ticketCounterToken: ticketCounterConnection.token,
      rushSyncEnabled: !!sessionConfig?.rushSync?.enabled,
      rushSyncCookie: String(sessionConfig?.rushSync?.cookie || ''),
    }));
    return;
  }

  if (pathname === '/api/preferences' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(sessionConfig.uiPreferences));
    return;
  }

  if (pathname === '/api/preferences' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body);
      sessionConfig.uiPreferences = normalizeUiPreferences(payload || {});
      saveConfig(sessionConfig);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, preferences: sessionConfig.uiPreferences }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/config/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const ticketCounterConnection = getTicketCounterConnection();
    res.end(JSON.stringify({
      hasApiKey: !!sessionConfig.apiKey,
      hasTicketCounterToken: !!ticketCounterConnection.token,
      hasTicketCounterDisplayUrl: !!ticketCounterConnection.displayUrl,
      rushSync: rushSyncCache.status,
      preferencesReady: !!sessionConfig.uiPreferences,
      restarting: false,
      version: APP_VERSION,
      ready: true,
    }));
    return;
  }

  if (pathname === '/api/server/restart' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, restarting: true, version: APP_VERSION }));
    restartServerProcess();
    return;
  }

  if (pathname === '/api/dashboard') {
    const fromDate = requestUrl.searchParams.get('from');
    const toDate = requestUrl.searchParams.get('to') || fromDate;
    if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'from/to must be YYYY-MM-DD' }));
      return;
    }

    try {
      const requestStartedAt = Date.now();
      console.log(`[REQ] /api/dashboard from=${fromDate} to=${toDate} start`);
      const dashboard = await buildDashboardData(fromDate, toDate);
      console.log(`[REQ] /api/dashboard from=${fromDate} to=${toDate} success total=${Date.now() - requestStartedAt}ms`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dashboard));
    } catch (e) {
      console.log(`[REQ] /api/dashboard from=${fromDate} to=${toDate} failure`);
      console.error('[DASH ERROR]', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/invoices') {
    const fromDate = requestUrl.searchParams.get('date');
    const toDate = requestUrl.searchParams.get('to') || fromDate;
    if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'date/to must be YYYY-MM-DD' }));
      return;
    }
    try {
      const dashboard = await buildDashboardData(fromDate, toDate);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dashboard.audit));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/sales') {
    const fromDate = requestUrl.searchParams.get('from');
    const toDate = requestUrl.searchParams.get('to') || fromDate;
    if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'from/to must be YYYY-MM-DD' }));
      return;
    }
    try {
      const dashboard = await buildDashboardData(fromDate, toDate);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dashboard.sales));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/payments') {
    const fromDate = requestUrl.searchParams.get('from');
    const toDate = requestUrl.searchParams.get('to') || fromDate;
    if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'from/to must be YYYY-MM-DD' }));
      return;
    }
    try {
      const dashboard = await buildDashboardData(fromDate, toDate);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dashboard.payments));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/debug') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(escJson({
      version: APP_VERSION,
      cachedInvoiceDetails: Object.keys(invoiceDetailCacheById).length,
      cachedTicketDetails: Object.keys(ticketDetailCacheByInternalId).length,
    }));
    return;
  }

  if (pathname === '/api/debug/ticket-appointment') {
    const orderId = String(requestUrl.searchParams.get('orderId') || '').trim();
    if (!orderId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'orderId is required' }));
      return;
    }

    const overrideDisplayUrl = String(requestUrl.searchParams.get('displayUrl') || '').trim();
    const savedConnection = getTicketCounterConnection();
    const overrideConnection = parseTicketCounterDisplayUrl(overrideDisplayUrl);
    const apiBase = overrideConnection.apiBase || savedConnection.apiBase;
    const token = overrideConnection.token || savedConnection.token;

    if (!token || !apiBase) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ticket Counter Display URL is required before using this debug endpoint.' }));
      return;
    }

    try {
      const ticketsRaw = await fetchAllTicketCounterPages(apiBase, 'tcd/tickets_by_date', { token });

      const rawTickets = Array.isArray(ticketsRaw?.data?.pagination?.data) ? ticketsRaw.data.pagination.data : [];
      const matchingRows = rawTickets.filter((ticket) => String(ticket?.order_id || '').trim() === orderId);
      const meta = await fetchTicketMetaByOrderId(orderId, { forceFresh: true });
      const rawDueCandidates = matchingRows
        .map((ticket) => ({ raw: ticket?.due_on, parsed: parseDueTimestamp(ticket?.due_on) }))
        .filter((item) => item.parsed);

      const rawIssues = Array.from(new Set(matchingRows.map((ticket) => decodeHtml(ticket?.device_issue || '')).filter(Boolean)));
      const rawDevices = Array.from(new Set(matchingRows.map((ticket) => decodeHtml(ticket?.device || '')).filter(Boolean)));
      const combinedText = [
        meta.repairCategory,
        meta.serviceName,
        meta.serviceSearchText,
        ...rawIssues,
        ...rawDevices,
      ].filter(Boolean).join(', ');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(escJson({
        version: APP_VERSION,
        orderId,
        foundInTicketCounter: matchingRows.length > 0,
        rawRowCount: matchingRows.length,
        rawRows: matchingRows,
        meta,
        rawDueCandidates,
        computed: {
          rawIssues,
          rawDevices,
          combinedText,
          hasDueAt: !!(rawDueCandidates[0]?.parsed || meta?.dueAt),
          dueAt: rawDueCandidates[0]?.parsed || meta?.dueAt || null,
          matchesTechSupport: /tech support/i.test(combinedText),
          matchesServiceMatchers: isScheduledServiceName(combinedText, sessionConfig.uiPreferences),
          qualifiesAsAppointment: !!((rawDueCandidates[0]?.parsed || meta?.dueAt) && (
            /tech support/i.test(combinedText) ||
            isScheduledServiceName(combinedText, sessionConfig.uiPreferences)
          )),
        },
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/debug/ticket-rush') {
    const queryId = String(
      requestUrl.searchParams.get('orderId')
      || requestUrl.searchParams.get('ticketId')
      || requestUrl.searchParams.get('id')
      || ''
    ).trim();
    if (!queryId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'orderId, ticketId, or id is required' }));
      return;
    }

    const overrideDisplayUrl = String(requestUrl.searchParams.get('displayUrl') || '').trim();
    const savedConnection = getTicketCounterConnection();
    const overrideConnection = parseTicketCounterDisplayUrl(overrideDisplayUrl);
    const apiBase = overrideConnection.apiBase || savedConnection.apiBase;
    const token = overrideConnection.token || savedConnection.token;

    if (!token || !apiBase) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ticket Counter Display URL is required before using this debug endpoint.' }));
      return;
    }

    try {
      const ticketsRaw = await fetchAllTicketCounterPages(apiBase, 'tcd/tickets_by_date', { token });

      const rawTickets = Array.isArray(ticketsRaw?.data?.pagination?.data) ? ticketsRaw.data.pagination.data : [];
      const matchingRows = rawTickets.filter((ticket) => (
        String(ticket?.order_id || '').trim() === queryId
        || String(ticket?.id || '').trim() === queryId
        || String(ticket?.orderIdToSort || '').trim() === queryId
      ));
      const rushRows = matchingRows.filter((ticket) => isTruthyRushJob(ticket?.rush_job));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(escJson({
        version: APP_VERSION,
        queryId,
        matchedOrderIds: Array.from(new Set(matchingRows.map((ticket) => String(ticket?.order_id || '').trim()).filter(Boolean))),
        matchedInternalIds: Array.from(new Set(matchingRows.map((ticket) => String(ticket?.id || '').trim()).filter(Boolean))),
        foundInTicketCounter: matchingRows.length > 0,
        rawRowCount: matchingRows.length,
        rushRowCount: rushRows.length,
        anyRowHasRushJob: rushRows.length > 0,
        rawRows: matchingRows,
        rushRows,
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/debug/ticket-public-rush') {
    const orderId = String(requestUrl.searchParams.get('orderId') || '').trim();
    if (!orderId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'orderId is required' }));
      return;
    }

    if (!getConfiguredApiKey()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'RepairDesk API key is required before using this debug endpoint.' }));
      return;
    }

    try {
      const lookup = await fetchTicketLookupByOrderId(orderId);
      const detail = lookup?.summary?.id ? await fetchTicketDetailRobust(lookup.summary.id, orderId) : null;
      const lookupSignals = [];
      const detailSignals = [];
      collectRushSignals(lookup || {}, lookupSignals);
      collectRushSignals(detail || {}, detailSignals);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(escJson({
        version: APP_VERSION,
        orderId,
        foundLookup: !!lookup,
        foundDetail: !!detail,
        lookupSummary: lookup?.summary || null,
        detailSummary: detail?.summary || null,
        lookupRushSignals: lookupSignals,
        detailRushSignals: detailSignals,
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/debug/ticket-rush-sync') {
    const queryId = String(
      requestUrl.searchParams.get('orderId')
      || requestUrl.searchParams.get('ticketId')
      || requestUrl.searchParams.get('id')
      || ''
    ).trim();
    if (!queryId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'orderId, ticketId, or id is required' }));
      return;
    }

    try {
      const result = await fetchRushSyncListingRows();
      const matchingRows = result.rows.filter((row) => (
        String(row?.order_id || '').trim() === queryId
        || String(row?.id || '').trim() === queryId
      ));
      const rushRows = matchingRows.filter((row) => isTruthyRushJob(row?.rush_job));
      const allRushRows = result.rows.filter((row) => isTruthyRushJob(row?.rush_job));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(escJson({
        version: APP_VERSION,
        queryId,
        origin: result.origin,
        rushSyncStatus: result.status,
        totalRows: result.rows.length,
        totalRushRows: allRushRows.length,
        sampleRushOrderIds: allRushRows.slice(0, 10).map((row) => String(row?.order_id || '').trim()).filter(Boolean),
        matchedOrderIds: Array.from(new Set(matchingRows.map((row) => String(row?.order_id || '').trim()).filter(Boolean))),
        matchedInternalIds: Array.from(new Set(matchingRows.map((row) => String(row?.id || '').trim()).filter(Boolean))),
        foundInRushSync: matchingRows.length > 0,
        rushRowCount: rushRows.length,
        anyRowHasRushJob: rushRows.length > 0,
        matchingRows,
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/debug/queue-membership') {
    const rawOrderIds = String(requestUrl.searchParams.get('orderIds') || requestUrl.searchParams.get('orderId') || '').trim();
    const orderIds = rawOrderIds
      .split(',')
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (!orderIds.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'orderIds or orderId is required' }));
      return;
    }

    const savedConnection = getTicketCounterConnection();
    if (!savedConnection.token || !savedConnection.apiBase) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ticket Counter Display URL is required before using this debug endpoint.' }));
      return;
    }

    try {
      const [configResp, ticketsRawBase, rushSyncListingResult] = await Promise.all([
        rdTicketCounter(savedConnection.apiBase, 'tcd/tcd_configuration', { token: savedConnection.token }),
        fetchAllTicketCounterPages(savedConnection.apiBase, 'tcd/tickets_by_date', { token: savedConnection.token }),
        fetchRushSyncListingRows(),
      ]);
      const rushSyncMap = Object.create(null);
      for (const row of rushSyncListingResult.rows || []) {
        const orderId = String(row?.order_id || '').trim();
        if (orderId && isTruthyRushJob(row?.rush_job)) {
          rushSyncMap[orderId] = true;
        }
      }
      const { mergedPayload: ticketsRaw, addedRows: rushSyncFallbackRows } = mergeTicketCounterRowsWithRushSyncFallback(
        ticketsRawBase,
        rushSyncListingResult.rows,
        sessionConfig.uiPreferences
      );
      const configRaw = parseJsonSafe(configResp.body);
      if (configResp.status !== 200 || !configRaw || Number(configRaw.status) !== 1) {
        throw new Error('RepairDesk ticket counter configuration request failed');
      }

      const rawTickets = Array.isArray(ticketsRaw?.data?.pagination?.data) ? ticketsRaw.data.pagination.data : [];
      const queueMetaOrderIds = Array.from(new Set(rawTickets
        .filter((ticket) => (
          ticket?.status === 'Ready to Start' ||
          ticket?.status === 'Parts Arrived - Ready to Start' ||
          ticket?.status === 'Pending - New' ||
          ticket?.status === 'Pending - New (No Notifications)' ||
          ticket?.status === 'Needs Estimate' ||
          ticket?.status === 'Need to order Parts' ||
          ticket?.status === 'In Progress' ||
          ticket?.status === 'Diagnostics - In Progress' ||
          ticket?.status === 'Waiting on Customer' ||
          ticket?.status === 'Waiting for Parts' ||
          ticket?.status === 'Quality Control' ||
          !!ticket?.due_on ||
          ticket?.status === 'Scheduled'
        ))
        .map((ticket) => String(ticket?.order_id || '').trim())
        .filter(Boolean)));
      const hasApiKey = !!getConfiguredApiKey();
      const forceFreshMetaOrderIds = new Set(rawTickets
        .filter((ticket) => !!ticket?.due_on || ticket?.status === 'Scheduled')
        .map((ticket) => String(ticket?.order_id || '').trim())
        .filter(Boolean));
      const queueMetaEntries = await Promise.all(queueMetaOrderIds.map(async (orderId) => {
        if (!hasApiKey) return [orderId, emptyTicketMeta()];
        try {
          return [orderId, await fetchTicketMetaByOrderId(orderId, { forceFresh: forceFreshMetaOrderIds.has(orderId) })];
        } catch (_) {
          return [orderId, emptyTicketMeta()];
        }
      }));
      const ticketMetaByOrderId = Object.fromEntries(queueMetaEntries);
      const payload = normalizeTicketCounterPayload(
        configRaw,
        ticketsRaw,
        ticketMetaByOrderId,
        sessionConfig.uiPreferences,
        rushSyncMap,
        rushSyncListingResult.status
      );

      const results = orderIds.map((orderId) => {
        const matchingRows = rawTickets.filter((ticket) => String(ticket?.order_id || '').trim() === orderId);
        const matchingRushSyncRows = (rushSyncListingResult.rows || []).filter((row) => String(row?.order_id || '').trim() === orderId);
        const placement = queuePlacementForOrderId(payload, orderId);
        return {
          orderId,
          foundInRawFeed: matchingRows.length > 0,
          rawStatuses: Array.from(new Set(matchingRows.map((ticket) => decodeHtml(ticket?.status || '').trim()).filter(Boolean))),
          rawRows: matchingRows,
          foundInRushSyncListing: matchingRushSyncRows.length > 0,
          rushSyncStatuses: Array.from(new Set(matchingRushSyncRows.map((row) => rushSyncRowStatus(row)).filter(Boolean))),
          rushSyncRows: matchingRushSyncRows,
          placement: placement ? {
            queueKey: placement.queueKey,
            columnKey: placement.columnKey,
            dayIso: placement.dayIso || null,
            ticket: placement.ticket,
          } : null,
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(escJson({
        version: APP_VERSION,
        checkedOrderIds: orderIds,
        ticketCounterFetch: ticketsRaw?._fetchDebug || {},
        rushSyncFallbackRowsAdded: rushSyncFallbackRows.length,
        waitingColumn: {
          label: payload.uiPreferences?.columns?.waiting?.label || 'Waiting',
          visible: payload.uiPreferences?.columns?.waiting?.visible !== false,
          refurbMode: payload.uiPreferences?.columns?.waiting?.refurbMode || 'all',
          statuses: payload.uiPreferences?.columns?.waiting?.statuses || [],
          queueCount: Array.isArray(payload.waitingQueue) ? payload.waitingQueue.length : 0,
        },
        results,
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/ticket-counter') {
    const overrideDisplayUrl = String(requestUrl.searchParams.get('displayUrl') || '').trim();
    const overrideToken = String(requestUrl.searchParams.get('token') || '').trim();
    const savedConnection = getTicketCounterConnection();
    const overrideConnection = parseTicketCounterDisplayUrl(overrideDisplayUrl);
    const apiBase = overrideConnection.apiBase || savedConnection.apiBase;
    const token = overrideConnection.token || overrideToken || savedConnection.token;
    if (!token) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ticket Counter Display URL is required' }));
      return;
    }
    if (!apiBase) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ticket Counter Display URL is invalid or incomplete. Paste the full Copy Display URL from RepairDesk.' }));
      return;
    }

    try {
      const [configResp, ticketsRawBase, rushSyncListingResult] = await Promise.all([
        rdTicketCounter(apiBase, 'tcd/tcd_configuration', { token }),
        fetchAllTicketCounterPages(apiBase, 'tcd/tickets_by_date', { token }),
        fetchRushSyncListingRows(),
      ]);
      const rushSyncMap = Object.create(null);
      for (const row of rushSyncListingResult.rows || []) {
        const orderId = String(row?.order_id || '').trim();
        if (orderId && isTruthyRushJob(row?.rush_job)) {
          rushSyncMap[orderId] = true;
        }
      }
      const { mergedPayload: ticketsRaw } = mergeTicketCounterRowsWithRushSyncFallback(
        ticketsRawBase,
        rushSyncListingResult.rows,
        sessionConfig.uiPreferences
      );
      const configRaw = parseJsonSafe(configResp.body);
      if (configResp.status !== 200 || !configRaw || Number(configRaw.status) !== 1) {
        throw new Error('RepairDesk ticket counter configuration request failed');
      }
      const rawTickets = Array.isArray(ticketsRaw?.data?.pagination?.data) ? ticketsRaw.data.pagination.data : [];
      const rawOrderIds = new Set(rawTickets.map((ticket) => String(ticket?.order_id || '').trim()).filter(Boolean));
      const queueMetaOrderIds = Array.from(new Set(rawTickets
        .filter((ticket) => (
          ticket?.status === 'Ready to Start' ||
          ticket?.status === 'Parts Arrived - Ready to Start' ||
          ticket?.status === 'Pending - New' ||
          ticket?.status === 'Pending - New (No Notifications)' ||
          ticket?.status === 'Needs Estimate' ||
          ticket?.status === 'Need to order Parts' ||
          ticket?.status === 'In Progress' ||
          ticket?.status === 'Diagnostics - In Progress' ||
          ticket?.status === 'Waiting on Customer' ||
          ticket?.status === 'Waiting for Parts' ||
          ticket?.status === 'Quality Control' ||
          !!ticket?.due_on ||
          ticket?.status === 'Scheduled'
        ))
        .map((ticket) => String(ticket?.order_id || '').trim())
        .filter(Boolean)));
      const hasApiKey = !!getConfiguredApiKey();
      const forceFreshMetaOrderIds = new Set(rawTickets
        .filter((ticket) => !!ticket?.due_on || ticket?.status === 'Scheduled')
        .map((ticket) => String(ticket?.order_id || '').trim())
        .filter(Boolean));
      const queueMetaEntries = await Promise.all(queueMetaOrderIds.map(async (orderId) => {
        if (!hasApiKey) {
          return [orderId, emptyTicketMeta()];
        }
        try {
          return [orderId, await fetchTicketMetaByOrderId(orderId, { forceFresh: forceFreshMetaOrderIds.has(orderId) })];
        } catch (e) {
          console.log(`[TICKET] Meta lookup failed for order=${orderId}: ${e.message}`);
          return [orderId, emptyTicketMeta()];
        }
      }));
      const queueMetaByOrderId = Object.fromEntries(queueMetaEntries);
      let ticketsForPayload = ticketsRaw;
      if (hasApiKey) {
        try {
          const appointmentFallbackRows = await fetchScheduledAppointmentFallbackRows(rawOrderIds);
          if (appointmentFallbackRows.length) {
            for (const row of appointmentFallbackRows) {
              const orderId = String(row?.order_id || '').trim();
              if (!orderId) continue;
              rawOrderIds.add(orderId);
              if (!queueMetaByOrderId[orderId]) {
                try {
                  queueMetaByOrderId[orderId] = await fetchTicketMetaByOrderId(orderId, { forceFresh: true });
                } catch (error) {
                  console.log(`[APPOINTMENTS] Fallback queue meta lookup failed for order=${orderId}: ${error.message}`);
                  queueMetaByOrderId[orderId] = emptyTicketMeta();
                }
              }
            }
            ticketsForPayload = mergeSyntheticTicketRowsIntoPayload(ticketsRaw, appointmentFallbackRows);
          }
        } catch (error) {
          console.log(`[APPOINTMENTS] Scheduled fallback fetch failed: ${error.message}`);
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(
        normalizeTicketCounterPayload(
          configRaw,
          ticketsForPayload,
          queueMetaByOrderId,
          sessionConfig.uiPreferences,
          rushSyncMap,
          rushSyncListingResult.status
        )
      ));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: `Unknown route: ${pathname}` }));
});

server.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  One Bite Technology — RepairDesk Dashboard v2    ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║  Running at: http://localhost:${PORT}                ║`);
  console.log('║                                                    ║');
  console.log('║  Payment totals use payment date                   ║');
  console.log('║  Repair audit uses final invoice creation date     ║');
  console.log('║  COG buckets are prorated across partial payments  ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');
});
