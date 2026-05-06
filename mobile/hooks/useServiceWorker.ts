import { useEffect, useState } from 'react';

export function useServiceWorker() {
  const [registered, setRegistered] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    
    if ('serviceWorker' in navigator) {
      setSupported(true);
      
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('SW registered:', registration.scope);
          setRegistered(true);
        })
        .catch((err) => {
          console.log('SW registration failed:', err);
        });
    }
  }, []);

  return { registered, supported };
}