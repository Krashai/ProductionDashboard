import { Suspense } from 'react';
import { RootView } from '@/components/RootView';

// RootView (and everything it can render — OverviewView/Wallboard) reads
// search params via next/navigation's useSearchParams(), which in the App
// Router requires a Suspense boundary in the parent (otherwise Next warns at
// build time and deopts the whole page to full CSR). Both branches are
// Client Components anyway (client-side timers/data subscriptions), so this
// page stays a plain Server Component that only mounts the dispatcher.
export default function Home() {
  return (
    <Suspense fallback={null}>
      <RootView />
    </Suspense>
  );
}
