// This service file will register the service worker for PWA capabilities
export function register() {
    console.log('[serviceWorkerRegistration.js] Checking if service worker registration is supported');
    
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      window.addEventListener('load', () => {
        const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;
        
        console.log('[serviceWorkerRegistration.js] Registering service worker at:', swUrl);
        
        navigator.serviceWorker
          .register(swUrl)
          .then(registration => {
            console.log('[serviceWorkerRegistration.js] Service worker registered successfully:', registration);
            
            registration.onupdatefound = () => {
              const installingWorker = registration.installing;
              if (installingWorker == null) {
                return;
              }
              
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    console.log('[serviceWorkerRegistration.js] New content is available; please refresh.');
                  } else {
                    console.log('[serviceWorkerRegistration.js] Content is cached for offline use.');
                  }
                }
              };
            };
          })
          .catch(error => {
            console.error('[serviceWorkerRegistration.js] Error during service worker registration:', error);
          });
      });
    } else {
      console.log('[serviceWorkerRegistration.js] Service worker not supported or not in production mode');
    }
  }
  
  export function unregister() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(registration => {
          registration.unregister();
          console.log('[serviceWorkerRegistration.js] Service worker unregistered');
        })
        .catch(error => {
          console.error('[serviceWorkerRegistration.js] Error unregistering service worker:', error);
        });
    }
  }