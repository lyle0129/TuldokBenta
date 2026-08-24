import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import './index.css'
import App from './App.jsx'
import { queryClient, persistOptions } from './queryClient'
import { ensureLegacyOfflineMigration } from './utils/offlineMigration'

// Before the tree mounts, so nothing can read a namespaced offline key while a
// pre-upgrade queue is still sitting under the old un-namespaced one. It is a
// no-op on a boot with no session — see ensureLegacyOfflineMigration.
ensureLegacyOfflineMigration()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      <App />
      {/* Dev-only, so it drops out of the production bundle. */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </PersistQueryClientProvider>
  </StrictMode>,
)
