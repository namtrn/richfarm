import { useEffect, useState } from "react";
import type { PageKey } from "./types";

import { Sidebar } from "./components/Sidebar";
import { StatsBar } from "./components/StatsBar";
import { PlantManager } from "./components/PlantManager";
import { GroupManager } from "./components/GroupManager";
import { TaxonomyManager } from "./components/TaxonomyManager";
import { PhotoManager } from "./components/PhotoManager";
import { LoginPage } from "./components/LoginPage";
import { DataHealth } from "./components/DataHealth";
import { ContentInbox, ContentSourceHealthBadge } from "./components/ContentInbox";
import { ToastContainer, useToast } from "./components/Toast";

import { usePlants } from "./hooks/usePlants";
import { useGroups } from "./hooks/useGroups";
import { useAdaptationTerms } from "./hooks/useAdaptationTerms";
import { usePhotos } from "./hooks/usePhotos";
import { useI18n } from "./hooks/useI18n";
import { useAuth } from "./hooks/useAuth";
import { useBackendPlants } from "./hooks/useBackendPlants";
import { useDataHealth } from "./hooks/useDataHealth";
import { useContentInbox, useContentMonitorStatus } from "./hooks/useContentInbox";

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>("plants");
  const { toasts, addToast, dismiss } = useToast();

  const auth = useAuth();
  const plants = usePlants(auth.authedFetch, auth.isLoggedIn);
  const groups = useGroups(auth.authedFetch);
  const taxonomy = useAdaptationTerms(auth.authedFetch);
  const photos = usePhotos(auth.authedFetch);
  const i18n = useI18n(auth.authedFetch);
  const backend = useBackendPlants(auth.authedFetch, auth.isLoggedIn);
  const dataHealth = useDataHealth(auth.authedFetch, auth.isLoggedIn && activePage === "data-health");
  const contentInbox = useContentInbox(auth.authedFetch, auth.isLoggedIn && activePage === "content-inbox");
  const monitorStatus = useContentMonitorStatus(
    auth.authedFetch,
    auth.isLoggedIn && (activePage === "content-inbox" || activePage === "data-health"),
  );

  // Load backend stats once auth is available.
  useEffect(() => {
    if (!auth.isLoggedIn) return;
    void backend.loadStats();
  }, [auth.isLoggedIn, backend.loadStats]);

  // Lazy-load other data on tab switch
  useEffect(() => {
    if (activePage === "groups" && groups.groups.length === 0) {
      void groups.load();
    }
    if (activePage === "taxonomy" && taxonomy.terms.length === 0) {
      void taxonomy.load();
    }
    if (activePage === "photos" && photos.photos.length === 0) {
      void photos.load();
    }
  }, [activePage]);

  // Auto-select first item when data loads
  useEffect(() => {
    if (plants.mode === "create") return;
    if (!plants.selectedId && plants.plants.length > 0) {
      plants.select(plants.plants[0]);
    }
  }, [plants.plants]);

  useEffect(() => {
    if (groups.mode === "create") return;
    if (!groups.selectedId && groups.groups.length > 0) {
      groups.select(groups.groups[0]);
    }
  }, [groups.groups]);

  useEffect(() => {
    if (photos.mode === "create") return;
    if (!photos.selectedId && photos.photos.length > 0) {
      photos.select(photos.photos[0]);
    }
  }, [photos.photos]);

  if (!auth.isLoggedIn) {
    return (
      <>
        <LoginPage auth={auth} />
        <ToastContainer toasts={toasts} dismiss={dismiss} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        email={auth.email}
        onLogout={auth.logout}
      />

      <main className="main-area">
        <StatsBar
          stats={plants.stats}
          groupCount={groups.groups.length}
          backendStats={backend.stats}
        />

        {activePage === "plants" && (
          <PlantManager p={plants} i18n={i18n} backend={backend} isAdmin={auth.isAdmin} onToast={addToast} authedFetch={auth.authedFetch} />
        )}
        {activePage === "groups" && (
          <GroupManager g={groups} isAdmin={auth.isAdmin} onToast={addToast} />
        )}
        {activePage === "taxonomy" && (
          <TaxonomyManager t={taxonomy} isAdmin={auth.isAdmin} onToast={addToast} />
        )}
        {activePage === "photos" && (
          <PhotoManager ph={photos} onToast={addToast} />
        )}
        {activePage === "data-health" && (
          <>
            <ContentSourceHealthBadge status={monitorStatus} />
            <DataHealth health={dataHealth} isAdmin={auth.isAdmin} />
          </>
        )}
        {activePage === "content-inbox" && (
          <ContentInbox inbox={contentInbox} status={monitorStatus} isAdmin={auth.isAdmin} />
        )}
      </main>

      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
