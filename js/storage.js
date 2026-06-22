export const DEFAULT_SETTINGS = {
  unitName: 'MARDET-Monterey',
  cooldownDays: 2,
  baselines: { weekday: 1, friday: 1.5, saturday: 2, sunday: 2, holiday: 3 },
  supernumeraryPoints: 1,
  halfSplitDay: 15,
  baselineVersion: 2,
};

const STORAGE_KEY = 'yougotfirewatch-app-data';
const LEGACY_STORAGE_KEY = 'fairduty-app-data';

export function loadAppState() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Migrate to new baseline defaults if user still has old defaults
    if (!data.settings?.baselineVersion || data.settings.baselineVersion < 2) {
      data.settings = {
        ...DEFAULT_SETTINGS,
        ...data.settings,
        baselines: { ...DEFAULT_SETTINGS.baselines },
        baselineVersion: 2,
      };
    }
    if (data.settings.unitName === '1st Battalion, Alpha Company') {
      data.settings.unitName = DEFAULT_SETTINGS.unitName;
    }
    if (!data.adncoHistory) data.adncoHistory = [];
    return data;
  } catch { return null; }
}

export function saveAppState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportAppData(state) {
  return JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    personnel: state.personnel,
    settings: state.settings,
    history: state.history,
    adncoHistory: state.adncoHistory ?? [],
  }, null, 2);
}

export function importAppData(json) {
  try {
    const data = JSON.parse(json);
    return {
      personnel: data.personnel ?? [],
      settings: { ...DEFAULT_SETTINGS, ...data.settings },
      history: data.history ?? [],
      adncoHistory: data.adncoHistory ?? [],
    };
  } catch { return null; }
}

export function clearAllData() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}