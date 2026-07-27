import { useEffect, useState } from 'react';
import { AppEvents } from '../constants/events';
import type { SettingKey, Settings } from '../utils/settings';

/**
 * Reads a desktop setting and keeps it in sync with the settings UI, which
 * broadcasts `AppEvents.SETTINGS_CHANGED` after every write.
 */
export function useAppSetting<K extends SettingKey>(key: K, fallback: Settings[K]): Settings[K] {
  const [value, setValue] = useState<Settings[K]>(fallback);

  useEffect(() => {
    const read = () => {
      window.electron.getSetting(key).then((stored) => setValue(stored ?? fallback));
    };

    read();
    window.addEventListener(AppEvents.SETTINGS_CHANGED, read);
    return () => window.removeEventListener(AppEvents.SETTINGS_CHANGED, read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return value;
}
