import { useEffect, useState } from 'react';

type DocumentTheme = 'light' | 'dark';

function getDocumentTheme(): DocumentTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function useDocumentTheme(): DocumentTheme {
  const [theme, setTheme] = useState<DocumentTheme>(getDocumentTheme);

  useEffect(() => {
    const syncTheme = () => setTheme(getDocumentTheme());
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
