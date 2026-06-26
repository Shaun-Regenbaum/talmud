import { createSignal, Show } from 'solid-js';
import { AlignPage } from './AlignPage';
import { AttributionsPage } from './AttributionsPage';
import Compare from './Compare';
import DafViewer from './DafViewer';
import { HowItWorksPage } from './HowItWorksPage';
import { McpPage } from './McpPage';
import PretextSpike from './PretextSpike';
import { SagesPage } from './SagesPage';
import SettingsPage from './SettingsPage';
import { SpineCoveragePage } from './SpineCoveragePage';
import { TopBar } from './TopBar';
import { TutorialPage } from './TutorialPage';
import { UsagePage } from './UsagePage';
import { VoicesPage } from './VoicesPage';

function currentRoute() {
  // #sages/<slug> deep-links into SagesPage; treat the prefix as the route.
  // #admin-rabbis is a legacy alias — SagesPage absorbed the operator UI, so
  // old bookmarks redirect there. #experiment / #enrichment fold into the
  // daf view since the EnrichmentPage debug surface was removed alongside
  // the legacy enrichment routes. #help is now the interactive #tutorial.
  const raw = window.location.hash.replace(/^#/, '') || 'daf';
  if (raw === 'experiment' || raw === 'enrichment') {
    window.location.hash = 'daf';
    return 'daf';
  }
  if (raw === 'admin-rabbis') {
    window.location.hash = 'sages';
    return 'sages';
  }
  if (raw === 'help') {
    window.location.hash = 'tutorial';
    return 'tutorial';
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
        bar covers the other routes. #tutorial is fully self-contained (and its
        Help button would be a no-op there), so it owns the whole viewport. */}
      <Show when={route() !== 'daf' && route() !== 'tutorial'}>
        <TopBar />
      </Show>
      <Show
        when={route() === 'tutorial'}
        fallback={
          <Show
            when={route() === 'align'}
            fallback={
              <Show
                when={route() === 'usage'}
                fallback={
                  <Show
                    when={route() === 'compare'}
                    fallback={
                      <Show
                        when={route() === 'spike'}
                        fallback={
                          <Show
                            when={route() === 'sages'}
                            fallback={
                              <Show
                                when={route() === 'settings'}
                                fallback={
                                  <Show
                                    when={route() === 'about'}
                                    fallback={
                                      <Show
                                        when={route() === 'mcp'}
                                        fallback={
                                          <Show
                                            when={
                                              route() === 'spine' || route().startsWith('spine/')
                                            }
                                            fallback={
                                              <Show
                                                when={route() === 'howitworks'}
                                                fallback={
                                                  <Show
                                                    when={
                                                      route() === 'voices' ||
                                                      route().startsWith('voices/')
                                                    }
                                                    fallback={<DafViewer />}
                                                  >
                                                    <VoicesPage />
                                                  </Show>
                                                }
                                              >
                                                <HowItWorksPage />
                                              </Show>
                                            }
                                          >
                                            <SpineCoveragePage />
                                          </Show>
                                        }
                                      >
                                        <McpPage />
                                      </Show>
                                    }
                                  >
                                    <AttributionsPage />
                                  </Show>
                                }
                              >
                                <SettingsPage />
                              </Show>
                            }
                          >
                            <SagesPage />
                          </Show>
                        }
                      >
                        <PretextSpike />
                      </Show>
                    }
                  >
                    <Compare />
                  </Show>
                }
              >
                <UsagePage />
              </Show>
            }
          >
            <AlignPage />
          </Show>
        }
      >
        <TutorialPage />
      </Show>
    </>
  );
}
