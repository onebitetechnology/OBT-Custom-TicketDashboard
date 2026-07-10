/**
 * One Bite Technology — RepairDesk Ticket Display Server
 * Run: node server.js
 * Then open: http://localhost:3000
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const net = require('net');
const { spawn } = require('child_process');
const {
  SHARED_NONCE_HEADER,
  SHARED_SIGNATURE_HEADER,
  SHARED_TIMESTAMP_HEADER,
  createSharedAuthHeaders,
  generateSharedStoreSecret,
  normalizeSharedStoreSecret,
  sharedSecretFingerprint,
  verifySharedAuth,
} = require('./lib/shared-auth');

const PORT = Number(process.env.PORT || 3000);
const SERVER_RESTART_EXIT_CODE = Number(process.env.ONEBITE_SERVER_RESTART_EXIT_CODE || 75);
const APP_VERSION = 'v3.0.0-beta.1';
const RD_PUBLIC_BASE = 'https://api.repairdesk.co/api/web/v1';
const DEFAULT_API_KEY = '';
const LOOKBACK_DAYS = 90;
const DATA_DIR = process.env.APP_DATA_DIR || __dirname;
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const CONFIG_BACKUP_DIR = path.join(DATA_DIR, 'config-backups');
const MAX_CONFIG_BACKUPS = 20;
const LEGACY_INVOICE_DETAIL_CACHE_PATH = path.join(DATA_DIR, 'invoice-detail-cache.json');
const PRIORITY_INVOICE_CACHE_PATH = path.join(DATA_DIR, 'invoice-priority-cache.json');
const TICKET_META_CACHE_PATH = path.join(DATA_DIR, 'ticket-meta-cache.json');
const TICKET_META_CACHE_VERSION = 7;
const PRIORITY_INVOICE_CACHE_VERSION = 1;
const TICKET_META_CACHE_TTL_MS = 60 * 1000;
const RUSH_SYNC_CACHE_TTL_MS = 45 * 1000;
const RUSH_SYNC_MAX_PAGES = 10;
const SHARED_CALENDAR_SYNC_CACHE_TTL_MS = 60 * 1000;
const SHARED_HOST_DISCOVERY_CACHE_TTL_MS = 30 * 1000;
const API_HEALTH_CACHE_TTL_MS = 60 * 1000;
const LOCAL_ADMIN_TOKEN = process.env.ONEBITE_LOCAL_ADMIN_TOKEN || crypto.randomBytes(32).toString('base64url');
const ADMIN_HEADER = 'x-one-bite-admin-token';
const MAX_CONFIG_BODY_BYTES = 512 * 1024;
const MAX_PREFERENCES_BODY_BYTES = 35 * 1024 * 1024;
const MAX_LOGO_DATA_URL_CHARS = 4 * 1024 * 1024;
const MAX_BACKGROUND_DATA_URL_CHARS = 12 * 1024 * 1024;
const MAX_SIDE_MEDIA_DATA_URL_CHARS = 28 * 1024 * 1024;
const MAX_AMBIENT_AUDIO_DATA_URL_CHARS = 30 * 1024 * 1024;
const MAX_REMOTE_RESPONSE_BYTES = 40 * 1024 * 1024;
const IMAGE_DATA_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const SIDE_MEDIA_DATA_MIME_TYPES = [...IMAGE_DATA_MIME_TYPES, 'video/mp4', 'video/webm', 'video/ogg'];
const AUDIO_DATA_MIME_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm'];
const BOARD_COLUMN_KEYS = ['readyToStart', 'inProgress', 'needsAttention', 'waiting', 'qualityControl', 'column6'];
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
  schedule: {
    includedWeekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    blockedWeekdays: ['Monday'],
    blockToday: false,
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
    appearance: {
      headerLayout: 'auto',
      headerTitleScalePercent: 100,
      headerCountScalePercent: 100,
      headerTextColor: '#f3f8ff',
      headerSurfaceColor: '#ffffff',
      headerSurfaceOpacityPercent: 10,
    },
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
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      console.log('[CONFIG] Loaded saved tokens from config.json');
      const normalized = normalizeAppConfig(saved);
      const generatedSharedSecret = ensureSharedHostSecret(normalized);
      if (Object.prototype.hasOwnProperty.call(saved, 'bearerToken') || Object.prototype.hasOwnProperty.call(saved, 'xTenant') || generatedSharedSecret) {
        backupExistingConfig();
        writeConfigAtomic(normalized);
        console.log('[CONFIG] Migrated saved configuration to the current secure format.');
      }
      return normalized;
    }
  } catch (e) {
    console.log('[CONFIG] Could not read config.json:', e.message);
    const recovered = recoverConfigFromNewestBackup();
    if (recovered) {
      console.log('[CONFIG] Restored config.json from the newest valid backup.');
      return recovered;
    }
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

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergePreferencePayload(base, patch) {
  if (!isPlainObject(base)) return isPlainObject(patch) ? mergePreferencePayload({}, patch) : patch;
  if (!isPlainObject(patch)) return JSON.parse(JSON.stringify(base));
  const merged = JSON.parse(JSON.stringify(base));
  Object.entries(patch).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = mergePreferencePayload(merged[key], value);
    } else {
      merged[key] = value;
    }
  });
  return merged;
}

function normalizeHexColor(value, fallback) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  return fallback;
}

function normalizeDataUrl(value, allowedMimeTypes, maxChars) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length > maxChars) return '';
  const match = raw.match(/^data:([^;,]+)[;,]/i);
  if (!match) return '';
  const mimeType = String(match[1] || '').trim().toLowerCase();
  return allowedMimeTypes.includes(mimeType) ? raw : '';
}

function normalizePercent(value, fallback, min, max) {
  return Math.max(min, Math.min(max, Number(value ?? fallback) || fallback));
}

function normalizeNumberRange(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
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

function normalizeColumnAppearance(savedAppearance = {}, fallbackAppearance = DEFAULT_UI_PREFERENCES.columns.appearance) {
  const headerLayout = ['auto', 'inline', 'stacked'].includes(String(savedAppearance?.headerLayout || '').toLowerCase())
    ? String(savedAppearance.headerLayout).toLowerCase()
    : fallbackAppearance.headerLayout;
  return {
    headerLayout,
    headerTitleScalePercent: normalizePercent(
      savedAppearance?.headerTitleScalePercent,
      fallbackAppearance.headerTitleScalePercent,
      70,
      140
    ),
    headerCountScalePercent: normalizePercent(
      savedAppearance?.headerCountScalePercent,
      fallbackAppearance.headerCountScalePercent,
      70,
      140
    ),
    headerTextColor: normalizeHexColor(
      savedAppearance?.headerTextColor,
      fallbackAppearance.headerTextColor
    ),
    headerSurfaceColor: normalizeHexColor(
      savedAppearance?.headerSurfaceColor,
      fallbackAppearance.headerSurfaceColor
    ),
    headerSurfaceOpacityPercent: normalizePercent(
      savedAppearance?.headerSurfaceOpacityPercent,
      fallbackAppearance.headerSurfaceOpacityPercent,
      0,
      35
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
      logoDataUrl: normalizeDataUrl(savedPrefs?.brand?.logoDataUrl, IMAGE_DATA_MIME_TYPES, MAX_LOGO_DATA_URL_CHARS),
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
      sideMediaDataUrl: normalizeDataUrl(savedPrefs?.brand?.sideMediaDataUrl, SIDE_MEDIA_DATA_MIME_TYPES, MAX_SIDE_MEDIA_DATA_URL_CHARS),
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
      backgroundImageDataUrl: normalizeDataUrl(savedPrefs?.brand?.backgroundImageDataUrl, IMAGE_DATA_MIME_TYPES, MAX_BACKGROUND_DATA_URL_CHARS),
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
    ambientAudio: {
      enabled: savedPrefs?.ambientAudio?.enabled !== undefined
        ? !!savedPrefs.ambientAudio.enabled
        : DEFAULT_UI_PREFERENCES.ambientAudio.enabled,
      audioDataUrl: normalizeDataUrl(savedPrefs?.ambientAudio?.audioDataUrl, AUDIO_DATA_MIME_TYPES, MAX_AMBIENT_AUDIO_DATA_URL_CHARS),
      fileName: String(savedPrefs?.ambientAudio?.fileName || '').trim().slice(0, 180),
      volumePercent: normalizeNumberRange(
        savedPrefs?.ambientAudio?.volumePercent,
        DEFAULT_UI_PREFERENCES.ambientAudio.volumePercent,
        0,
        100
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
      openTicketIdLinks: savedPrefs?.display?.openTicketIdLinks !== undefined
        ? !!savedPrefs.display.openTicketIdLinks
        : DEFAULT_UI_PREFERENCES.display.openTicketIdLinks,
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
      blockToday: savedPrefs?.schedule?.blockToday !== undefined ? !!savedPrefs.schedule.blockToday : DEFAULT_UI_PREFERENCES.schedule.blockToday,
      temporaryBlockedDates: normalizeStringArray(savedPrefs?.schedule?.temporaryBlockedDates, DEFAULT_UI_PREFERENCES.schedule.temporaryBlockedDates),
      dailyAppointmentLimit: Math.floor(normalizeNumberRange(
        savedPrefs?.schedule?.dailyAppointmentLimit,
        DEFAULT_UI_PREFERENCES.schedule.dailyAppointmentLimit,
        0,
        12
      )),
      sharedCalendarSync: normalizeSharedCalendarSync(savedPrefs?.schedule?.sharedCalendarSync, DEFAULT_UI_PREFERENCES.schedule.sharedCalendarSync),
      showCalendar: savedPrefs?.schedule?.showCalendar !== undefined ? !!savedPrefs.schedule.showCalendar : DEFAULT_UI_PREFERENCES.schedule.showCalendar,
      rotateWeeks: savedPrefs?.schedule?.rotateWeeks !== undefined ? !!savedPrefs.schedule.rotateWeeks : DEFAULT_UI_PREFERENCES.schedule.rotateWeeks,
      stackWeeks: savedPrefs?.schedule?.stackWeeks !== undefined ? !!savedPrefs.schedule.stackWeeks : DEFAULT_UI_PREFERENCES.schedule.stackWeeks,
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
      appearance: normalizeColumnAppearance(savedPrefs?.columns?.appearance, DEFAULT_UI_PREFERENCES.columns.appearance),
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
  const ticketCounterConnection = parseTicketCounterDisplayUrl(saved?.ticketCounterDisplayUrl || '');
  return {
    apiKey: String(saved?.apiKey || '').trim(),
    ticketCounterDisplayUrl: ticketCounterConnection.displayUrl,
    ticketCounterToken: String(saved?.ticketCounterToken || '').trim(),
    rushSync: {
      enabled: saved?.rushSync?.enabled !== undefined ? !!saved.rushSync.enabled : false,
      cookie: normalizeRushSyncCookie(saved?.rushSync?.cookie || ''),
    },
    uiPreferences: normalizeUiPreferences(saved?.uiPreferences || {}),
  };
}

function configBackupTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function pruneConfigBackups() {
  try {
    if (!fs.existsSync(CONFIG_BACKUP_DIR)) return;
    const backups = fs.readdirSync(CONFIG_BACKUP_DIR)
      .filter((fileName) => /^config-\d{8}-\d{6}\.json$/i.test(fileName))
      .map((fileName) => ({
        fileName,
        path: path.join(CONFIG_BACKUP_DIR, fileName),
        mtimeMs: fs.statSync(path.join(CONFIG_BACKUP_DIR, fileName)).mtimeMs,
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    backups.slice(MAX_CONFIG_BACKUPS).forEach((backup) => {
      fs.rmSync(backup.path, { force: true });
    });
  } catch (error) {
    console.log('[CONFIG] Could not prune config backups:', error.message);
  }
}

function backupExistingConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return;
    fs.mkdirSync(CONFIG_BACKUP_DIR, { recursive: true });
    const backupPath = path.join(CONFIG_BACKUP_DIR, `config-${configBackupTimestamp()}.json`);
    fs.copyFileSync(CONFIG_PATH, backupPath);
    tightenFilePermissions(backupPath);
    pruneConfigBackups();
  } catch (error) {
    console.log('[CONFIG] Could not back up config.json:', error.message);
  }
}

function tightenFilePermissions(filePath) {
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(filePath, 0o600);
  } catch (error) {
    console.log('[CONFIG] Could not restrict config file permissions:', error.message);
  }
}

function writeConfigAtomic(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempPath = `${CONFIG_PATH}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
    tightenFilePermissions(tempPath);
    fs.renameSync(tempPath, CONFIG_PATH);
    tightenFilePermissions(CONFIG_PATH);
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch (_) {
      // Preserve the original write failure.
    }
    error.statusCode = 500;
    throw error;
  }
}

function recoverConfigFromNewestBackup() {
  try {
    if (!fs.existsSync(CONFIG_BACKUP_DIR)) return null;
    const backups = fs.readdirSync(CONFIG_BACKUP_DIR)
      .filter((fileName) => /^config-\d{8}-\d{6}\.json$/i.test(fileName))
      .map((fileName) => ({
        path: path.join(CONFIG_BACKUP_DIR, fileName),
        mtimeMs: fs.statSync(path.join(CONFIG_BACKUP_DIR, fileName)).mtimeMs,
      }))
      .sort((left, right) => right.mtimeMs - left.mtimeMs);
    for (const backup of backups) {
      try {
        const recovered = normalizeAppConfig(JSON.parse(fs.readFileSync(backup.path, 'utf8')));
        writeConfigAtomic(recovered);
        return recovered;
      } catch (_) {
        // Try the next newest backup.
      }
    }
  } catch (error) {
    console.log('[CONFIG] Could not restore a config backup:', error.message);
  }
  return null;
}

function saveConfig(config) {
  backupExistingConfig();
  writeConfigAtomic(config);
  console.log('[CONFIG] Saved config.json');
  return true;
}

function isRepairDeskHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  return host === 'repairdesk.co' || host.endsWith('.repairdesk.co');
}

function normalizeRepairDeskUrl(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return null;
    if (!isRepairDeskHostname(parsed.hostname)) return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.port && parsed.port !== '443') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function getConfiguredApiKey() {
  return String(sessionConfig?.apiKey || '').trim();
}

function apiKeyFingerprint(apiKey = '') {
  const normalized = String(apiKey || '').trim();
  if (!normalized) return '';
  return `${normalized.length}:${normalized.slice(0, 4)}:${normalized.slice(-4)}`;
}

async function checkRepairDeskApiHealth(options = {}) {
  const forceFresh = !!options.forceFresh;
  const apiKey = getConfiguredApiKey();
  if (!apiKey) {
    return {
      configured: false,
      working: false,
      checkedAt: null,
      lastError: 'RepairDesk API key is missing.',
    };
  }

  const keyFingerprint = apiKeyFingerprint(apiKey);
  const now = Date.now();
  if (!forceFresh && apiHealthCache.checkedAt && apiHealthCache.keyFingerprint === keyFingerprint && (now - apiHealthCache.checkedAt) < API_HEALTH_CACHE_TTL_MS) {
    return {
      configured: true,
      working: !!apiHealthCache.working,
      checkedAt: apiHealthCache.checkedAt,
      lastError: String(apiHealthCache.lastError || ''),
    };
  }

  try {
    const response = await rdPublic('tickets', { pagesize: 1, page: 0 });
    const raw = parseJsonSafe(response.body);
    const working = response.status === 200 && !!raw && typeof raw === 'object' && Array.isArray(raw?.data?.ticketData);
    const lastError = working ? '' : `RepairDesk returned ${response.status || 'an invalid response'} while testing the public API key.`;
    apiHealthCache = {
      checkedAt: now,
      keyFingerprint,
      working,
      lastError,
    };
    return {
      configured: true,
      working,
      checkedAt: now,
      lastError,
    };
  } catch (error) {
    const lastError = error?.message || 'Could not reach the RepairDesk public API.';
    apiHealthCache = {
      checkedAt: now,
      keyFingerprint,
      working: false,
      lastError,
    };
    return {
      configured: true,
      working: false,
      checkedAt: now,
      lastError,
    };
  }
}

function parseTicketCounterDisplayUrl(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { displayUrl: '', apiBase: '', token: '' };

  const parsed = normalizeRepairDeskUrl(raw);
  if (!parsed) return { displayUrl: '', apiBase: '', token: '' };
  const token = String(parsed.searchParams.get('token') || '').trim();
  return {
    displayUrl: parsed.toString(),
    apiBase: `${parsed.origin}/web/api/v1`,
    token,
  };
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

function isPrivateNetworkHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (!host.includes('.') && !host.includes(':')) return true;
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split('.').map((part) => Number(part));
    if (parts[0] === 10 || parts[0] === 127) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    return false;
  }
  if (ipVersion === 6) {
    return host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd');
  }
  return false;
}

function normalizeSharedCalendarHostUrl(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (!isPrivateNetworkHost(parsed.hostname)) return '';
    return parsed.origin;
  } catch (_) {
    return '';
  }
}

function normalizeSharedCalendarCachedPreferences(saved = {}, defaults = DEFAULT_UI_PREFERENCES.schedule.sharedCalendarSync.cachedPreferences) {
  let normalizedPreferences = null;
  if (saved?.preferences && typeof saved.preferences === 'object') {
    normalizedPreferences = normalizeUiPreferences(saved.preferences);
  } else if (saved?.cachedBlocks && typeof saved.cachedBlocks === 'object') {
    normalizedPreferences = normalizeUiPreferences({
      schedule: {
        blockedWeekdays: saved.cachedBlocks.blockedWeekdays || [],
        temporaryBlockedDates: saved.cachedBlocks.temporaryBlockedDates || [],
      },
    });
  }
  return {
    preferences: normalizedPreferences,
    sourceHostUrl: normalizeSharedCalendarHostUrl(saved?.sourceHostUrl || defaults.sourceHostUrl),
    syncedAt: saved?.syncedAt ? String(saved.syncedAt) : defaults.syncedAt,
  };
}

function normalizeSharedCalendarSync(saved = {}, defaults = DEFAULT_UI_PREFERENCES.schedule.sharedCalendarSync) {
  const legacySyncCalendarBlocks = saved?.syncCalendarBlocks !== undefined
    ? !!saved.syncCalendarBlocks
    : ((saved?.syncBlockedWeekdays !== undefined ? !!saved.syncBlockedWeekdays : false)
      || (saved?.syncTemporaryBlockedDates !== undefined ? !!saved.syncTemporaryBlockedDates : false)
      || defaults.syncCalendarBlocks);
  return {
    mode: ['local', 'host', 'follow'].includes(String(saved?.mode || '').toLowerCase())
      ? String(saved.mode).toLowerCase()
      : defaults.mode,
    boardName: String(saved?.boardName || defaults.boardName || '').trim().slice(0, 80),
    hostUrl: normalizeSharedCalendarHostUrl(saved?.hostUrl || defaults.hostUrl),
    sharedSecret: normalizeSharedStoreSecret(saved?.sharedSecret || defaults.sharedSecret),
    syncCalendarBlocks: legacySyncCalendarBlocks,
    syncAppointments: saved?.syncAppointments !== undefined ? !!saved.syncAppointments : defaults.syncAppointments,
    syncBrand: saved?.syncBrand !== undefined ? !!saved.syncBrand : defaults.syncBrand,
    syncDisplay: saved?.syncDisplay !== undefined ? !!saved.syncDisplay : defaults.syncDisplay,
    syncTicketDetails: saved?.syncTicketDetails !== undefined ? !!saved.syncTicketDetails : defaults.syncTicketDetails,
    syncColumns: saved?.syncColumns !== undefined ? !!saved.syncColumns : defaults.syncColumns,
    syncUpdates: saved?.syncUpdates !== undefined ? !!saved.syncUpdates : defaults.syncUpdates,
    cachedPreferences: normalizeSharedCalendarCachedPreferences(
      saved?.cachedPreferences || saved,
      defaults.cachedPreferences
    ),
  };
}

function ensureSharedHostSecret(config) {
  const syncSettings = config?.uiPreferences?.schedule?.sharedCalendarSync;
  if (syncSettings?.mode !== 'host' || syncSettings.sharedSecret) return false;
  syncSettings.sharedSecret = generateSharedStoreSecret();
  return true;
}

function sharedStoreBoardName(preferences = sessionConfig.uiPreferences) {
  const prefs = normalizeUiPreferences(preferences || {});
  const explicit = String(prefs?.schedule?.sharedCalendarSync?.boardName || '').trim();
  if (explicit) return explicit;
  const brandTitle = String(prefs?.brand?.title || '').trim();
  if (brandTitle) return brandTitle;
  return os.hostname();
}

function getLanBoardUrls() {
  const seen = new Set();
  const urls = [];
  const interfaces = os.networkInterfaces?.() || {};
  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (!entry || entry.internal || entry.family !== 'IPv4') return;
      const host = String(entry.address || '').trim();
      if (!host) return;
      const url = `http://${host}:${PORT}`;
      if (seen.has(url)) return;
      seen.add(url);
      urls.push(url);
    });
  });
  return urls;
}

function buildSharedStoreHostInfo(preferences = sessionConfig.uiPreferences) {
  const prefs = normalizeUiPreferences(preferences || {});
  return {
    version: 1,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    boardName: sharedStoreBoardName(prefs),
    brandTitle: String(prefs?.brand?.title || '').trim(),
    hostMode: prefs?.schedule?.sharedCalendarSync?.mode === 'host',
    urls: getLanBoardUrls(),
    port: PORT,
    hostname: os.hostname(),
  };
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

function emptySharedCalendarSyncStatus(overrides = {}) {
  return {
    mode: 'local',
    connected: false,
    usingCached: false,
    lastSyncedAt: null,
    lastError: '',
    hostUrl: '',
    source: 'local',
    ...overrides,
  };
}

function mergeUniqueStrings(...groups) {
  const output = [];
  const seen = new Set();
  groups.flat().forEach((value) => {
    const item = String(value || '').trim();
    if (!item) return;
    const key = item.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });
  return output;
}

function buildSharedCalendarBlocksPayload(preferences = sessionConfig.uiPreferences) {
  const prefs = normalizeUiPreferences(preferences || {});
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    boardName: sharedStoreBoardName(prefs),
    preferences: {
      schedule: {
        blockedWeekdays: [...prefs.schedule.blockedWeekdays],
        blockToday: !!prefs.schedule.blockToday,
        temporaryBlockedDates: [...prefs.schedule.temporaryBlockedDates],
      },
    },
  };
}

function buildSharedStoreSettingsPayload(preferences = sessionConfig.uiPreferences) {
  const prefs = normalizeUiPreferences(preferences || {});
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    boardName: sharedStoreBoardName(prefs),
    preferences: {
      brand: JSON.parse(JSON.stringify(prefs.brand)),
      display: JSON.parse(JSON.stringify(prefs.display)),
      updates: JSON.parse(JSON.stringify(prefs.updates)),
      schedule: {
        includedWeekdays: [...prefs.schedule.includedWeekdays],
        blockedWeekdays: [...prefs.schedule.blockedWeekdays],
        blockToday: !!prefs.schedule.blockToday,
        temporaryBlockedDates: [...prefs.schedule.temporaryBlockedDates],
        dailyAppointmentLimit: prefs.schedule.dailyAppointmentLimit,
        showCalendar: prefs.schedule.showCalendar,
        rotateWeeks: prefs.schedule.rotateWeeks,
        stackWeeks: prefs.schedule.stackWeeks,
        currentWeekDurationSeconds: prefs.schedule.currentWeekDurationSeconds,
        nextWeekDurationSeconds: prefs.schedule.nextWeekDurationSeconds,
        dimPastDays: prefs.schedule.dimPastDays,
        defaultLeadMinutes: prefs.schedule.defaultLeadMinutes,
        onsiteLeadMinutes: prefs.schedule.onsiteLeadMinutes,
        imminentMinutes: prefs.schedule.imminentMinutes,
      },
      staleRules: JSON.parse(JSON.stringify(prefs.staleRules)),
      columns: JSON.parse(JSON.stringify(prefs.columns)),
    },
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
let apiHealthCache = {
  checkedAt: 0,
  keyFingerprint: '',
  working: false,
  lastError: '',
};
let rushSyncCache = {
  fetchedAt: 0,
  origin: '',
  cookie: '',
  map: Object.create(null),
  status: emptyRushSyncStatus(),
};
let sharedCalendarSyncCache = {
  fetchedAt: 0,
  hostUrl: '',
  settingsKey: '',
  effectivePreferences: null,
  status: emptySharedCalendarSyncStatus(),
};
let sharedHostDiscoveryCache = {
  scannedAt: 0,
  hosts: [],
};
const sharedAuthNonces = new Map();

function restartServerProcess() {
  try {
    saveConfig(sessionConfig);
    savePriorityInvoiceCache();
    saveTicketMetaCache();

    const serverEntry = process.argv[1] || path.join(__dirname, 'server.js');
    const restartEnvironment = {
      ...process.env,
      PORT: String(PORT),
      APP_DATA_DIR: DATA_DIR,
      ONEBITE_LOCAL_ADMIN_TOKEN: LOCAL_ADMIN_TOKEN,
    };

    setTimeout(() => {
      server.close(() => {
        if (process.parentPort?.postMessage) {
          process.exit(SERVER_RESTART_EXIT_CODE);
          return;
        }

        const child = spawn(process.execPath, [serverEntry], {
          cwd: path.dirname(serverEntry),
          env: restartEnvironment,
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        console.log(`[SERVER] Spawned replacement process pid=${child.pid} port=${PORT}`);
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 3000);
    }, 250);
    return true;
  } catch (error) {
    console.log('[SERVER] Restart failed:', error.message);
    return false;
  }
}

const ticketDetailCacheByInternalId = Object.create(null);
const ticketDetailCacheByOrderId = Object.create(null);
const ticketLookupCacheByOrderId = Object.create(null);
const priorityInvoiceCacheById = loadPriorityInvoiceCache();
const ticketMetaCacheByOrderId = loadTicketMetaCache();
const inventoryCacheBySku = Object.create(null);
const inventoryCacheById = Object.create(null);

function removeLegacyInvoiceDetailCache() {
  try {
    if (!fs.existsSync(LEGACY_INVOICE_DETAIL_CACHE_PATH)) return;
    fs.rmSync(LEGACY_INVOICE_DETAIL_CACHE_PATH, { force: true });
    console.log('[CACHE] Removed legacy raw invoice-detail-cache.json');
  } catch (e) {
    console.log('[CACHE] Could not remove legacy invoice-detail-cache.json:', e.message);
  }
}

function loadPriorityInvoiceCache() {
  try {
    removeLegacyInvoiceDetailCache();
    if (!fs.existsSync(PRIORITY_INVOICE_CACHE_PATH)) {
      return Object.create(null);
    }
    const saved = JSON.parse(fs.readFileSync(PRIORITY_INVOICE_CACHE_PATH, 'utf8'));
    if (!saved || typeof saved !== 'object') {
      return Object.create(null);
    }
    const filtered = Object.create(null);
    for (const [invoiceId, entry] of Object.entries(saved)) {
      if (
        entry &&
        typeof entry === 'object' &&
        Number(entry.cacheVersion || 0) === PRIORITY_INVOICE_CACHE_VERSION &&
        typeof entry.hasPriorityFee === 'boolean'
      ) {
        filtered[invoiceId] = {
          cacheVersion: PRIORITY_INVOICE_CACHE_VERSION,
          fetchedAt: Number(entry.fetchedAt || 0) || Date.now(),
          hasPriorityFee: !!entry.hasPriorityFee,
        };
      }
    }
    if (Object.keys(filtered).length !== Object.keys(saved).length) {
      fs.writeFileSync(PRIORITY_INVOICE_CACHE_PATH, JSON.stringify(filtered, null, 2), 'utf8');
      console.log(`[CACHE] Pruned ${Object.keys(saved).length - Object.keys(filtered).length} legacy priority invoice cache rows`);
    }
    console.log(`[CACHE] Loaded ${Object.keys(filtered).length} priority invoice rows from disk`);
    return filtered;
  } catch (e) {
    console.log('[CACHE] Could not read invoice-priority-cache.json:', e.message);
    return Object.create(null);
  }
}

function savePriorityInvoiceCache() {
  try {
    fs.writeFileSync(PRIORITY_INVOICE_CACHE_PATH, JSON.stringify(priorityInvoiceCacheById, null, 2), 'utf8');
  } catch (e) {
    console.log('[CACHE] Could not save invoice-priority-cache.json:', e.message);
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

function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let received = 0;
    let settled = false;
    req.on('data', (chunk) => {
      if (settled) return;
      received += chunk.length;
      if (received > maxBytes) {
        settled = true;
        const error = new Error('Request body is too large.');
        error.statusCode = 413;
        reject(error);
        req.resume();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(body);
    });
    req.on('error', reject);
  });
}

function redactUrlForLog(fullUrl) {
  try {
    const parsed = new URL(fullUrl);
    for (const key of ['api_key', 'token', 'access_token', 'key']) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, '[redacted]');
    }
    return parsed.toString();
  } catch (_) {
    return '[invalid URL]';
  }
}

function fetchJsonWithTimeout(fullUrl, headers = {}, timeoutMs = 20000, maxBytes = MAX_REMOTE_RESPONSE_BYTES) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(fullUrl);
    } catch (error) {
      reject(error);
      return;
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      reject(new Error(`Unsupported URL protocol: ${parsedUrl.protocol || 'unknown'}`));
      return;
    }
    console.log(`[HTTP] GET ${redactUrlForLog(parsedUrl.toString())}`);
    const client = parsedUrl.protocol === 'http:' ? http : https;
    const req = client.get(parsedUrl, { headers }, (res) => {
      let data = '';
      let received = 0;
      let settled = false;
      res.on('data', (chunk) => {
        if (settled) return;
        received += chunk.length;
        if (received > maxBytes) {
          settled = true;
          req.destroy();
          reject(new Error('Remote response body is too large.'));
          return;
        }
        data += chunk;
      });
      res.on('end', () => {
        if (settled) return;
        settled = true;
        console.log(`[HTTP] ${res.statusCode}`);
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

function fetchJson(fullUrl, headers = {}) {
  return fetchJsonWithTimeout(fullUrl, headers, 20000, MAX_REMOTE_RESPONSE_BYTES);
}

function candidateSharedHostUrls() {
  const candidates = new Set();
  const ports = Array.from(new Set([PORT, 54338])).filter(Boolean);
  const interfaces = os.networkInterfaces?.() || {};
  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (!entry || entry.internal || entry.family !== 'IPv4') return;
      const host = String(entry.address || '').trim();
      if (!host) return;
      const octets = host.split('.');
      if (octets.length !== 4) return;
      const prefix = octets.slice(0, 3).join('.');
      for (let i = 1; i <= 254; i += 1) {
        const candidateHost = `${prefix}.${i}`;
        ports.forEach((port) => {
          candidates.add(`http://${candidateHost}:${port}`);
        });
      }
    });
  });
  getLanBoardUrls().forEach((url) => candidates.delete(url));
  return Array.from(candidates);
}

async function discoverSharedStoreHosts() {
  if ((Date.now() - Number(sharedHostDiscoveryCache.scannedAt || 0)) < SHARED_HOST_DISCOVERY_CACHE_TTL_MS) {
    return sharedHostDiscoveryCache.hosts;
  }

  const urls = candidateSharedHostUrls();
  const hosts = [];
  const concurrency = 24;
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const index = cursor;
      cursor += 1;
      const baseUrl = urls[index];
      try {
        const response = await fetchJsonWithTimeout(`${baseUrl}/api/shared-store-host-info`, { Accept: 'application/json' }, 900);
        const payload = parseJsonSafe(response.body);
        if (response.status !== 200 || !payload || typeof payload !== 'object' || payload.hostMode !== true) continue;
        const discoveredUrl = normalizeSharedCalendarHostUrl(payload.primaryUrl || baseUrl);
        if (!discoveredUrl) continue;
        hosts.push({
          boardName: String(payload.boardName || payload.brandTitle || discoveredUrl).trim() || discoveredUrl,
          hostUrl: discoveredUrl,
          appVersion: String(payload.appVersion || '').trim(),
          hostname: String(payload.hostname || '').trim(),
        });
      } catch (_) {
        // Ignore non-hosts and offline addresses during discovery.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length || 1) }, () => worker()));
  const deduped = [];
  const seen = new Set();
  hosts
    .sort((left, right) => String(left.boardName || '').localeCompare(String(right.boardName || '')))
    .forEach((host) => {
      const key = `${host.hostUrl}|${host.boardName}`;
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(host);
    });
  sharedHostDiscoveryCache = {
    scannedAt: Date.now(),
    hosts: deduped,
  };
  return deduped;
}

function rdWeb(baseOrigin, endpoint, params = {}, cookie = '') {
  const parsedOrigin = normalizeRepairDeskUrl(baseOrigin);
  const origin = parsedOrigin?.origin || '';
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
  let parsedBase;
  try {
    parsedBase = new URL(String(apiBase || ''));
  } catch (_) {
    parsedBase = null;
  }
  if (!parsedBase || parsedBase.protocol !== 'https:' || !isRepairDeskHostname(parsedBase.hostname) || parsedBase.pathname !== '/web/api/v1') {
    throw new Error('RepairDesk Ticket Counter Display URL is not configured');
  }
  const queryParams = new URLSearchParams(params);
  const fullUrl = `${parsedBase.origin}/web/api/v1/${endpoint}?${queryParams.toString()}`;
  return fetchJson(fullUrl, {
    Accept: 'application/json',
    Authorization: 'Bear :)',
    'User-Agent': 'OneBiteTech-TicketCounter/1.0',
  });
}

function persistSharedCalendarCachedPreferencesIfNeeded(nextCachedPreferences) {
  const current = normalizeSharedCalendarCachedPreferences(
    sessionConfig?.uiPreferences?.schedule?.sharedCalendarSync?.cachedPreferences || {}
  );
  const next = normalizeSharedCalendarCachedPreferences(nextCachedPreferences || {});
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  sessionConfig.uiPreferences = normalizeUiPreferences({
    ...sessionConfig.uiPreferences,
    schedule: {
      ...(sessionConfig.uiPreferences?.schedule || {}),
      sharedCalendarSync: {
        ...(sessionConfig.uiPreferences?.schedule?.sharedCalendarSync || {}),
        cachedPreferences: next,
      },
    },
  });
  saveConfig(sessionConfig);
}

function mergeScheduleBlocks(localSchedule, remoteSchedule) {
  return {
    blockedWeekdays: mergeUniqueStrings(localSchedule?.blockedWeekdays, remoteSchedule?.blockedWeekdays),
    temporaryBlockedDates: mergeUniqueStrings(localSchedule?.temporaryBlockedDates, remoteSchedule?.temporaryBlockedDates),
  };
}

function applySharedSettings(preferences, remotePreferences, syncSettings) {
  const prefs = normalizeUiPreferences(preferences || {});
  const nextPrefs = JSON.parse(JSON.stringify(prefs));
  const remote = normalizeUiPreferences(remotePreferences || {});
  const syncCalendarBlocks = syncSettings?.syncCalendarBlocks !== false;

  if (syncSettings?.syncBrand) {
    nextPrefs.brand = JSON.parse(JSON.stringify(remote.brand));
  }

  if (syncSettings?.syncDisplay) {
    nextPrefs.display.fullscreen = remote.display.fullscreen;
    nextPrefs.display.orientation = remote.display.orientation;
    nextPrefs.display.displayTarget = remote.display.displayTarget;
    nextPrefs.display.densityMode = remote.display.densityMode;
  }

  if (syncSettings?.syncTicketDetails) {
    nextPrefs.display.customerNameMode = remote.display.customerNameMode;
    nextPrefs.display.showAssignedTech = remote.display.showAssignedTech;
    nextPrefs.display.assigneeFilter = [...remote.display.assigneeFilter];
    nextPrefs.display.pulseTimingEnabled = remote.display.pulseTimingEnabled;
    nextPrefs.display.pinPriorityTickets = remote.display.pinPriorityTickets;
    nextPrefs.display.priorityStrobeEnabled = remote.display.priorityStrobeEnabled;
    nextPrefs.display.priorityStrobeIntensity = remote.display.priorityStrobeIntensity;
    nextPrefs.staleRules = JSON.parse(JSON.stringify(remote.staleRules));
  }

  if (syncSettings?.syncColumns) {
    nextPrefs.columns = JSON.parse(JSON.stringify(remote.columns));
  }

  if (syncSettings?.syncUpdates) {
    nextPrefs.updates = JSON.parse(JSON.stringify(remote.updates));
  }

  if (syncSettings?.syncAppointments) {
    nextPrefs.schedule.includedWeekdays = [...remote.schedule.includedWeekdays];
    nextPrefs.schedule.showCalendar = remote.schedule.showCalendar;
    nextPrefs.schedule.rotateWeeks = remote.schedule.rotateWeeks;
    nextPrefs.schedule.stackWeeks = remote.schedule.stackWeeks;
    nextPrefs.schedule.blockToday = remote.schedule.blockToday;
    nextPrefs.schedule.dailyAppointmentLimit = remote.schedule.dailyAppointmentLimit;
    nextPrefs.schedule.currentWeekDurationSeconds = remote.schedule.currentWeekDurationSeconds;
    nextPrefs.schedule.nextWeekDurationSeconds = remote.schedule.nextWeekDurationSeconds;
    nextPrefs.schedule.dimPastDays = remote.schedule.dimPastDays;
    nextPrefs.schedule.defaultLeadMinutes = remote.schedule.defaultLeadMinutes;
    nextPrefs.schedule.onsiteLeadMinutes = remote.schedule.onsiteLeadMinutes;
    nextPrefs.schedule.imminentMinutes = remote.schedule.imminentMinutes;
  }

  if (syncCalendarBlocks) {
    const mergedBlocks = mergeScheduleBlocks(prefs.schedule, remote.schedule);
    nextPrefs.schedule.blockedWeekdays = mergedBlocks.blockedWeekdays;
    nextPrefs.schedule.temporaryBlockedDates = mergedBlocks.temporaryBlockedDates;
    nextPrefs.schedule.blockToday = !!remote.schedule.blockToday;
  }

  return nextPrefs;
}

async function resolveSharedCalendarPreferences(basePreferences = sessionConfig.uiPreferences) {
  const preferences = normalizeUiPreferences(basePreferences || {});
  const syncSettings = preferences.schedule?.sharedCalendarSync || DEFAULT_UI_PREFERENCES.schedule.sharedCalendarSync;

  if (syncSettings.mode === 'host') {
    return {
      preferences,
      status: emptySharedCalendarSyncStatus({
        mode: 'host',
        connected: true,
        source: 'host',
      }),
    };
  }

  if (syncSettings.mode !== 'follow') {
    return {
      preferences,
      status: emptySharedCalendarSyncStatus({
        mode: 'local',
        connected: false,
        source: 'local',
      }),
    };
  }

  if (!syncSettings.hostUrl) {
    return {
      preferences,
      status: emptySharedCalendarSyncStatus({
        mode: 'follow',
        connected: false,
        hostUrl: '',
        lastError: 'Shared calendar host URL is missing.',
        source: 'local',
      }),
    };
  }

  const settingsKey = JSON.stringify({
    hostUrl: syncSettings.hostUrl,
    sharedSecretFingerprint: sharedSecretFingerprint(syncSettings.sharedSecret),
    syncCalendarBlocks: !!syncSettings.syncCalendarBlocks,
    syncAppointments: !!syncSettings.syncAppointments,
    syncBrand: !!syncSettings.syncBrand,
    syncDisplay: !!syncSettings.syncDisplay,
    syncTicketDetails: !!syncSettings.syncTicketDetails,
    syncColumns: !!syncSettings.syncColumns,
    syncUpdates: !!syncSettings.syncUpdates,
    localPreferences: preferences,
  });

  if (
    sharedCalendarSyncCache.effectivePreferences &&
    (Date.now() - sharedCalendarSyncCache.fetchedAt) < SHARED_CALENDAR_SYNC_CACHE_TTL_MS &&
    sharedCalendarSyncCache.hostUrl === syncSettings.hostUrl &&
    sharedCalendarSyncCache.settingsKey === settingsKey
  ) {
    return {
      preferences: sharedCalendarSyncCache.effectivePreferences,
      status: sharedCalendarSyncCache.status,
    };
  }

  const sharedUrl = `${syncSettings.hostUrl}/api/shared-store-settings`;
  try {
    const sharedHeaders = createSharedAuthHeaders(syncSettings.sharedSecret, 'GET', '/api/shared-store-settings');
    const response = await fetchJson(sharedUrl, { Accept: 'application/json', ...sharedHeaders });
    const payload = parseJsonSafe(response.body);
    if (response.status !== 200 || !payload || typeof payload !== 'object') {
      throw new Error(`Shared calendar host returned ${response.status || 'an unexpected response'}.`);
    }
    const cachedPreferences = normalizeSharedCalendarCachedPreferences({
      preferences: payload.preferences || null,
      sourceHostUrl: syncSettings.hostUrl,
      syncedAt: payload.exportedAt || new Date().toISOString(),
    });
    persistSharedCalendarCachedPreferencesIfNeeded(cachedPreferences);
    const effectivePreferences = applySharedSettings(preferences, cachedPreferences.preferences || {}, syncSettings);
    const status = emptySharedCalendarSyncStatus({
      mode: 'follow',
      connected: true,
      usingCached: false,
      lastSyncedAt: cachedPreferences.syncedAt,
      hostUrl: syncSettings.hostUrl,
      source: 'network',
    });
    sharedCalendarSyncCache = {
      fetchedAt: Date.now(),
      hostUrl: syncSettings.hostUrl,
      settingsKey,
      effectivePreferences,
      status,
    };
    return { preferences: effectivePreferences, status };
  } catch (error) {
    const cachedPreferences = normalizeSharedCalendarCachedPreferences(syncSettings.cachedPreferences || {});
    if (cachedPreferences.preferences) {
      const effectivePreferences = applySharedSettings(preferences, cachedPreferences.preferences, syncSettings);
      const status = emptySharedCalendarSyncStatus({
        mode: 'follow',
        connected: false,
        usingCached: true,
        lastSyncedAt: cachedPreferences.syncedAt,
        lastError: String(error.message || error || '').trim(),
        hostUrl: syncSettings.hostUrl,
        source: 'cached',
      });
      sharedCalendarSyncCache = {
        fetchedAt: Date.now(),
        hostUrl: syncSettings.hostUrl,
        settingsKey,
        effectivePreferences,
        status,
      };
      return { preferences: effectivePreferences, status };
    }

    return {
      preferences,
      status: emptySharedCalendarSyncStatus({
        mode: 'follow',
        connected: false,
        usingCached: false,
        lastError: String(error.message || error || '').trim(),
        hostUrl: syncSettings.hostUrl,
        source: 'local',
      }),
    };
  }
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

function invoiceItemsForPriorityCheck(detail) {
  if (Array.isArray(detail?.items)) return detail.items;
  if (Array.isArray(detail?.line_items)) return detail.line_items;
  if (Array.isArray(detail?.summary?.line_items)) return detail.summary.line_items;
  return [];
}

function invoiceItemsHavePriorityFee(items = []) {
  return items.some((item) => {
    const name = String(item?.name || '');
    const sku = String(item?.sku || '');
    return /priority(?: service)? fee/i.test(name) || /^rush$/i.test(sku);
  });
}

async function fetchInvoiceHasPriorityFee(invoiceId) {
  const key = String(invoiceId || '');
  if (!key) return false;
  if (priorityInvoiceCacheById[key] && typeof priorityInvoiceCacheById[key].hasPriorityFee === 'boolean') {
    return priorityInvoiceCacheById[key].hasPriorityFee;
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await rdPublic(`invoices/${invoiceId}`);
    const raw = parseJsonSafe(response.body);
    const detail = raw?.data || null;
    if (response.status === 200 && isValidInvoiceDetail(detail)) {
      const hasPriorityFee = invoiceItemsHavePriorityFee(invoiceItemsForPriorityCheck(detail));
      priorityInvoiceCacheById[key] = {
        cacheVersion: PRIORITY_INVOICE_CACHE_VERSION,
        fetchedAt: Date.now(),
        hasPriorityFee,
      };
      savePriorityInvoiceCache();
      return hasPriorityFee;
    }
    console.log(`[INVOICE] Invalid detail for id=${invoiceId} attempt=${attempt}`);
    await sleep(250 * attempt);
  }

  return false;
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
    Object.prototype.hasOwnProperty.call(ticketMetaCacheByOrderId[key], 'internalTicketId') &&
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
    hasPriorityFee = await fetchInvoiceHasPriorityFee(invoiceId);
  }
  const meta = {
    metaVersion: TICKET_META_CACHE_VERSION,
    fetchedAt: Date.now(),
    internalTicketId: String(detail?.summary?.id || lookup?.summary?.id || '').trim(),
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
    internalTicketId: '',
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
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  return /(tech support|on[\s-]?site support|remote support|house ?call|appointment|scheduled service|consultation|onsite support)/i.test(text);
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

function buildCustomerPersonName(ticket) {
  return [ticket?.first_name, ticket?.last_name]
    .map((part) => decodeHtml(part).trim())
    .filter(Boolean)
    .join(' ')
    .trim() || 'Walk-in Customer';
}

function buildDisplayFirstName(ticket) {
  const lastName = decodeHtml(ticket?.last_name || '').trim();
  const firstName = decodeHtml(ticket?.first_name || '').trim();
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
  const maxPages = Math.max(1, Number(options.maxPages || 12) || 12);
  const maxCandidates = Math.max(1, Number(options.maxCandidates || 300) || 300);
  const lookbackDays = Math.max(1, Number(options.lookbackDays || 365) || 365);
  const calendarWindowDays = Math.max(7, Number(options.calendarWindowDays || 21) || 21);
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
      const summaryText = [
        summary?.repair_type,
        summary?.status,
        summary?.device,
        summary?.issue,
        summary?.item_name,
        summary?.name,
      ].filter(Boolean).join(', ');
      const looksScheduled = /scheduled|appointment|tech support|on[\s-]?site|remote support|house ?call|consultation/i.test(summaryText);
      return looksScheduled || !createdAt || createdAt >= lookbackCutoffUnix;
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
    const combinedMetaText = [
      meta?.repairCategory,
      meta?.serviceName,
      meta?.serviceSearchText,
    ].filter(Boolean).join(', ');
    const qualifiesAsAppointment = !!dueAt && (
      /scheduled/i.test(String(meta?.serviceSearchText || ''))
      || isScheduledServiceName(combinedMetaText, sessionConfig.uiPreferences)
      || /tech support/i.test(combinedMetaText)
    );
    if (!qualifiesAsAppointment) continue;
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
  if (mode === 'full_name') return buildCustomerPersonName(ticket);
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

function ticketCreatedAgeHours(ticket) {
  const createdAt = Number(ticket?.createdAt || 0) || null;
  if (!createdAt) return null;
  return Math.max(0, Math.floor((Date.now() - (createdAt * 1000)) / (1000 * 60 * 60)));
}

function formatAgeSummary(ageHours) {
  if (ageHours == null) return null;
  if (ageHours < 1) return '<1h';
  if (ageHours < 24) return `${ageHours}h`;
  return `${Math.floor(ageHours / 24)}d`;
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
  for (const columnKey of BOARD_COLUMN_KEYS) {
    const column = columns?.[columnKey];
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
  const configuredStatuses = BOARD_COLUMN_KEYS.map((columnKey) => preferences.columns?.[columnKey])
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
  rushSyncStatus = emptyRushSyncStatus(),
  calendarSyncStatus = emptySharedCalendarSyncStatus()
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
  const visibleColumns = BOARD_COLUMN_KEYS
    .map((columnKey) => preferences.columns?.[columnKey])
    .filter((column) => column?.visible !== false);
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
        internalTicketId: String(ticketMetaByOrderId[orderId]?.internalTicketId || '').trim(),
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
    if (!entry.internalTicketId && ticketMetaByOrderId[orderId]?.internalTicketId) {
      entry.internalTicketId = String(ticketMetaByOrderId[orderId].internalTicketId || '').trim();
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
        internalTicketId: ticket.internalTicketId,
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
      internalTicketId: ticket.internalTicketId,
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
      internalTicketId: ticket.internalTicketId,
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
        internalTicketId: ticket.internalTicketId,
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
        internalTicketId: ticket.internalTicketId,
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
        internalTicketId: ticket.internalTicketId,
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
      const isToday = iso === localDateKeyFromTimestamp(Date.now());
      const temporaryBlockedLabel = matchingTemporaryBlockLabel(date, preferences.schedule.temporaryBlockedDates);
      const blockedForToday = weekOffset === 0 && !!preferences.schedule.blockToday && isToday;
      const dailyAppointmentLimit = Math.floor(Number(preferences.schedule.dailyAppointmentLimit || 0));
      const appointments = allTickets
        .filter((ticket) => isCalendarAppointmentTicket(ticket, preferences))
        .filter((ticket) => localDateKeyFromTimestamp(ticket.dueAt) === iso)
        .sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0))
        .map((ticket) => ({
          orderId: ticket.orderId,
          customerName: ticket.customerName,
          dueOn: ticket.dueOn,
          dueAt: ticket.dueAt,
          device: ticket.scheduledServiceLabel || ticket.serviceName || ticket.issues[0] || ticket.devices[0] || '',
        }));
      const appointmentLimitReached = dailyAppointmentLimit > 0 && appointments.length >= dailyAppointmentLimit;
      return {
        label,
        iso,
        dailyAppointmentLimit,
        appointmentLimitReached,
        blocked: preferences.schedule.blockedWeekdays.includes(label) || !!temporaryBlockedLabel || blockedForToday || appointmentLimitReached,
        blockedReason: appointmentLimitReached
          ? 'No more appointments available'
          : temporaryBlockedLabel
          ? `Temporarily blocked (${temporaryBlockedLabel})`
          : (blockedForToday ? 'Today is blocked for new appointments' : ''),
        appointments,
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

  const queueTickets = [
    ...readyQueue,
    ...inProgressQueue,
    ...needsAttentionQueue,
    ...waitingQueue,
    ...qualityControlQueue,
    ...column6Queue,
  ];

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
  const oldestRegularQueueTicket = queueTickets
    .filter((ticket) => !ticket.isPriorityTicket && ticket.customerName !== 'Walk-in Customer')
    .sort((a, b) => {
      const ageDiff = (ticketCreatedAgeHours(b) ?? -1) - (ticketCreatedAgeHours(a) ?? -1);
      if (ageDiff !== 0) return ageDiff;
      return Number(a.orderId || 0) - Number(b.orderId || 0);
    })[0] || null;
  const oldestRegularQueueAgeHours = ticketCreatedAgeHours(oldestRegularQueueTicket);
  const activePriorityTickets = queueTickets
    .filter((ticket) => ticket.isPriorityTicket && ticket.customerName !== 'Walk-in Customer')
    .sort((a, b) => {
      const ageDiff = (ticketCreatedAgeHours(b) ?? -1) - (ticketCreatedAgeHours(a) ?? -1);
      if (ageDiff !== 0) {
        return ageDiff;
      }
      return Number(a.orderId || 0) - Number(b.orderId || 0);
    });
  const oldestPriorityReadyTicket = activePriorityTickets[0] || null;
  const oldestPriorityQueueAgeHours = ticketCreatedAgeHours(oldestPriorityReadyTicket);
  const openTicketFeedCount = Object.values(statusCountMap).reduce((sum, count) => sum + (Number(count) || 0), 0) || rawTickets.length;

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
    calendarSync: calendarSyncStatus,
    uiPreferences: preferences,
    statusColors,
    assignees: availableAssignees,
    totals: {
      tickets: openTicketFeedCount,
      boardTickets: allTickets.length,
      oldestRegularReadyDays: oldestRegularQueueAgeHours == null ? null : Math.floor(oldestRegularQueueAgeHours / 24),
      oldestPriorityReadyDays: oldestPriorityQueueAgeHours == null ? null : Math.floor(oldestPriorityQueueAgeHours / 24),
      oldestRegularReadyLabel: formatAgeSummary(oldestRegularQueueAgeHours),
      oldestPriorityReadyLabel: formatAgeSummary(oldestPriorityQueueAgeHours),
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

function remoteAddressForRequest(req) {
  return String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

function isLoopbackRequest(req) {
  const remoteAddress = remoteAddressForRequest(req);
  return remoteAddress === '::1' || remoteAddress === '127.0.0.1' || remoteAddress.startsWith('127.');
}

function requestHostParts(req) {
  const hostHeader = String(req.headers.host || '').trim();
  if (!hostHeader) return null;
  try {
    const parsed = new URL(`http://${hostHeader}`);
    return {
      hostname: String(parsed.hostname || '').replace(/^\[|\]$/g, '').toLowerCase(),
      port: String(parsed.port || '80'),
    };
  } catch (_) {
    return null;
  }
}

function allowedRequestHostnames() {
  const allowed = new Set(['localhost', '127.0.0.1', '::1']);
  const machineName = String(os.hostname() || '').trim().toLowerCase();
  if (machineName) {
    allowed.add(machineName);
    allowed.add(`${machineName}.local`);
  }
  const interfaces = os.networkInterfaces?.() || {};
  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      const address = String(entry?.address || '').trim().toLowerCase();
      if (address) allowed.add(address);
    });
  });
  return allowed;
}

function isAllowedRequestHost(req) {
  const host = requestHostParts(req);
  if (!host || host.port !== String(PORT)) return false;
  if (host.hostname.startsWith('127.')) return true;
  return allowedRequestHostnames().has(host.hostname);
}

function isLoopbackHostHeader(req) {
  const host = requestHostParts(req);
  if (!host || host.port !== String(PORT)) return false;
  return host.hostname === 'localhost' || host.hostname === '::1' || host.hostname.startsWith('127.');
}

function isSameOriginRequest(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.host === String(req.headers.host || '').trim();
  } catch (_) {
    return false;
  }
}

function isTrustedPageAssetRequest(req) {
  const fetchSite = String(req.headers['sec-fetch-site'] || '').trim().toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  const referer = String(req.headers.referer || '').trim();
  if (!referer) return true;
  try {
    return new URL(referer).host === String(req.headers.host || '').trim();
  } catch (_) {
    return false;
  }
}

function isAdminAuthorized(req) {
  const token = String(req.headers[ADMIN_HEADER] || '').trim();
  if (!isLoopbackRequest(req) || !isLoopbackHostHeader(req) || !token) return false;
  const supplied = Buffer.from(token);
  const expected = Buffer.from(LOCAL_ADMIN_TOKEN);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function isSharedSettingsAuthorized(req, syncSettings, pathname) {
  return verifySharedAuth({
    secret: syncSettings?.sharedSecret,
    method: req.method,
    pathname,
    timestamp: req.headers[SHARED_TIMESTAMP_HEADER],
    nonce: req.headers[SHARED_NONCE_HEADER],
    signature: req.headers[SHARED_SIGNATURE_HEADER],
    nonceCache: sharedAuthNonces,
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function requireLocalAdmin(req, res) {
  if (isAdminAuthorized(req)) return true;
  sendJson(res, 403, { error: 'Local admin authorization is required for this board action.' });
  return false;
}

function requireSharedSettingsAuth(req, res, syncSettings, pathname) {
  if (isSharedSettingsAuthorized(req, syncSettings, pathname)) return true;
  sendJson(res, 401, { error: 'A valid shared board key is required.' });
  return false;
}

function isPublicApiRoute(pathname, method) {
  if (method !== 'GET') return false;
  return [
    '/api/shared-calendar-blocks',
    '/api/shared-store-host-info',
    '/api/shared-store-settings',
  ].includes(pathname);
}

function applySecurityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Vary', 'Origin');
  if (isSameOriginRequest(req) && req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', [
      'Content-Type',
      ADMIN_HEADER,
      SHARED_TIMESTAMP_HEADER,
      SHARED_NONCE_HEADER,
      SHARED_SIGNATURE_HEADER,
    ].join(', '));
  }
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https://dghyt15qon7us.cloudfront.net",
    "media-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join('; '));
}


const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = requestUrl.pathname;

  applySecurityHeaders(req, res);
  if (!isAllowedRequestHost(req)) {
    sendJson(res, 421, { error: 'The request Host is not valid for this board.' });
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(isSameOriginRequest(req) ? 204 : 403);
    res.end();
    return;
  }

  if (pathname.startsWith('/api/') && !isPublicApiRoute(pathname, req.method) && !requireLocalAdmin(req, res)) {
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(302, { Location: '/ticket-display' });
    res.end();
    return;
  }

  if (pathname === '/ticket-display.css' && req.method === 'GET') {
    if (!isTrustedPageAssetRequest(req)) {
      sendJson(res, 403, { error: 'Same-origin asset request is required.' });
      return;
    }
    try {
      const css = fs.readFileSync(path.join(__dirname, 'ticket-display.css'), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(css);
    } catch (_) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Could not load ticket-display.css');
    }
    return;
  }

  if (pathname === '/ticket-display.js' && req.method === 'GET') {
    if (!isTrustedPageAssetRequest(req)) {
      sendJson(res, 403, { error: 'Same-origin asset request is required.' });
      return;
    }
    try {
      let script = fs.readFileSync(path.join(__dirname, 'ticket-display.js'), 'utf8');
      script = script.replace(/__APP_VERSION__/g, APP_VERSION);
      script = script.replace(
        /__LOCAL_ADMIN_TOKEN_JSON__/g,
        (isLoopbackRequest(req) && isLoopbackHostHeader(req)) ? JSON.stringify(LOCAL_ADMIN_TOKEN) : '""'
      );
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(script);
    } catch (_) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Could not load ticket-display.js');
    }
    return;
  }

  if (pathname === '/ticket-display' || pathname === '/ticket-display.html') {
    try {
      let html = fs.readFileSync(path.join(__dirname, 'ticket-display.html'), 'utf8');
      html = html.replace(/__APP_VERSION__/g, APP_VERSION);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(html);
    } catch (e) {
      res.writeHead(500);
      res.end('Could not load ticket-display.html');
    }
    return;
  }

  if (pathname === '/api/config' && req.method === 'POST') {
    try {
      const body = await readBody(req, MAX_CONFIG_BODY_BYTES);
      const { apiKey, ticketCounterToken, ticketCounterDisplayUrl, rushSyncEnabled, rushSyncCookie } = JSON.parse(body);
      if (apiKey !== undefined) sessionConfig.apiKey = String(apiKey || '').trim();
      if (ticketCounterDisplayUrl !== undefined) {
        const rawDisplayUrl = String(ticketCounterDisplayUrl || '').trim();
        const parsedDisplayUrl = parseTicketCounterDisplayUrl(rawDisplayUrl);
        if (rawDisplayUrl && !parsedDisplayUrl.displayUrl) {
          const error = new Error('Ticket Counter Display URL must be an HTTPS repairdesk.co address.');
          error.statusCode = 400;
          throw error;
        }
        sessionConfig.ticketCounterDisplayUrl = parsedDisplayUrl.displayUrl;
      }
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
      res.writeHead(e.statusCode || 400, { 'Content-Type': 'application/json' });
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
      const body = await readBody(req, MAX_PREFERENCES_BODY_BYTES);
      const payload = JSON.parse(body);
      if (!isPlainObject(payload)) {
        throw new Error('Display settings payload must be an object.');
      }
      sessionConfig.uiPreferences = normalizeUiPreferences(mergePreferencePayload(sessionConfig.uiPreferences || {}, payload));
      ensureSharedHostSecret(sessionConfig);
      sharedHostDiscoveryCache = {
        scannedAt: 0,
        hosts: [],
      };
      saveConfig(sessionConfig);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, preferences: sessionConfig.uiPreferences }));
    } catch (e) {
      res.writeHead(e.statusCode || 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/shared-calendar-blocks' && req.method === 'GET') {
    const localPreferences = normalizeUiPreferences(sessionConfig.uiPreferences || {});
    const syncSettings = localPreferences.schedule?.sharedCalendarSync || DEFAULT_UI_PREFERENCES.schedule.sharedCalendarSync;
    if (syncSettings.mode !== 'host') {
      sendJson(res, 409, { error: 'This board is not configured as a shared calendar host.' });
      return;
    }
    if (!requireSharedSettingsAuth(req, res, syncSettings, pathname)) return;
    sendJson(res, 200, buildSharedCalendarBlocksPayload(localPreferences));
    return;
  }

  if (pathname === '/api/shared-store-host-info' && req.method === 'GET') {
    const localPreferences = normalizeUiPreferences(sessionConfig.uiPreferences || {});
    const syncSettings = localPreferences.schedule?.sharedCalendarSync || DEFAULT_UI_PREFERENCES.schedule.sharedCalendarSync;
    if (syncSettings.mode !== 'host') {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'This board is not configured as a shared settings host.' }));
      return;
    }
    const info = buildSharedStoreHostInfo(localPreferences);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...info,
      primaryUrl: info.urls[0] || '',
    }));
    return;
  }

  if (pathname === '/api/shared-store-settings' && req.method === 'GET') {
    const localPreferences = normalizeUiPreferences(sessionConfig.uiPreferences || {});
    const syncSettings = localPreferences.schedule?.sharedCalendarSync || DEFAULT_UI_PREFERENCES.schedule.sharedCalendarSync;
    if (syncSettings.mode !== 'host') {
      sendJson(res, 409, { error: 'This board is not configured as a shared settings host.' });
      return;
    }
    if (!requireSharedSettingsAuth(req, res, syncSettings, pathname)) return;
    sendJson(res, 200, buildSharedStoreSettingsPayload(localPreferences));
    return;
  }

  if (pathname === '/api/shared-store-hosts' && req.method === 'GET') {
    try {
      const hosts = await discoverSharedStoreHosts();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        version: 1,
        scannedAt: new Date().toISOString(),
        hosts,
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message || 'Could not scan for shared settings hosts.' }));
    }
    return;
  }

  if (pathname === '/api/config/status') {
    const ticketCounterConnection = getTicketCounterConnection();
    const apiHealth = await checkRepairDeskApiHealth();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      hasApiKey: !!sessionConfig.apiKey,
      apiHealth,
      hasTicketCounterToken: !!ticketCounterConnection.token,
      hasTicketCounterDisplayUrl: !!ticketCounterConnection.displayUrl,
      rushSync: rushSyncCache.status,
      calendarSync: sharedCalendarSyncCache.status,
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

  if (pathname === '/api/debug') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(escJson({
      version: APP_VERSION,
      cachedPriorityInvoices: Object.keys(priorityInvoiceCacheById).length,
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
      const { preferences: effectivePreferences, status: calendarSyncStatus } = await resolveSharedCalendarPreferences(sessionConfig.uiPreferences);
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
        effectivePreferences
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
          effectivePreferences,
          rushSyncMap,
          rushSyncListingResult.status,
          calendarSyncStatus
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
  console.log('║  One Bite Technology — Ticket Display v3          ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║  Running at: http://localhost:${PORT}                ║`);
  console.log('║  Local admin APIs require the per-process token.   ║');
  console.log('║  Shared store settings stay on read-only routes.   ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');
});
