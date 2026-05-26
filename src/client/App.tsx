import { createSignal, Show } from 'solid-js';
import { TopBar } from './TopBar';
import PretextSpike from './PretextSpike';
import Compare from './Compare';
import DafViewer from './DafViewer';
import { UsagePage } from './UsagePage';
import { AlignPage } from './AlignPage';
import { SagesPage } from './SagesPage';
import SettingsPage from './SettingsPage';

function currentRoute() {
  // #sages/<slug> deep-links into SagesPage; treat the prefix as the route.
  // #admin-rabbis is a legacy alias — SagesPage absorbed the operator UI, so
  // old bookmarks redirect there. #experiment / #enrichment fold into the
  // daf view since the EnrichmentPage debug surface was removed alongside
  // the legacy enrichment routes.
  const raw = window.location.hash.replace(/^#/, '') || 'daf';
  if (raw === 'experiment' || raw === 'enrichment') {
    window.location.hash = 'daf';
    return 'daf';
  }
  if (raw === 'admin-rabbis') {
    window.location.hash = 'sages';
    return 'sages';
  }
  if (raw === 'sages' || raw.startsWith('sages/')) return 'sages';
  return raw;
}

export default function App() {
  const [route, setRoute] = createSignal(currentRoute());
  window.addEventListener('hashchange', () => setRoute(currentRoute()));

  return (
    <>
    {/* The daf page folds the EN/HE toggle into its own header; the floating
        overlay covers every other route. */}
    <Show when={route() !== 'daf'}><TopBar /></Show>
    <Show when={route() === 'align'} fallback={
      <Show when={route() === 'usage'} fallback={
        <Show when={route() === 'compare'} fallback={
          <Show when={route() === 'spike'} fallback={
            <Show when={route() === 'sages'} fallback={
              <Show when={route() === 'settings'} fallback={<DafViewer />}>
                <SettingsPage />
              </Show>
            }>
              <SagesPage />
            </Show>
          }>
            <PretextSpike />
          </Show>
        }>
          <Compare />
        </Show>
      }>
        <UsagePage />
      </Show>
    }>
      <AlignPage />
    </Show>
    </>
  );
}
