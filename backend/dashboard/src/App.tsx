import { useEffect, useState } from "react";
import type { PageKey } from "./types";

import { Sidebar } from "./components/Sidebar";
import { StatsBar } from "./components/StatsBar";
import { PlantManager } from "./components/PlantManager";
import { GroupManager } from "./components/GroupManager";
import { PhotoManager } from "./components/PhotoManager";
import { ToastContainer, useToast } from "./components/Toast";

import { usePlants } from "./hooks/usePlants";
import { useGroups } from "./hooks/useGroups";
import { usePhotos } from "./hooks/usePhotos";
import { useI18n } from "./hooks/useI18n";

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>("plants");
  const { toasts, addToast, dismiss } = useToast();

  const plants = usePlants();
  const groups = useGroups();
  const photos = usePhotos();
  const i18n = useI18n();

  // Load plants on mount
  useEffect(() => {
    void plants.load();
  }, []);

  // Lazy-load other data on tab switch
  useEffect(() => {
    if (activePage === "groups" && groups.groups.length === 0) {
      void groups.load();
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

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      <main className="main-area">
        <StatsBar
          stats={plants.stats}
          groupCount={groups.groups.length}
        />

        {activePage === "plants" && (
          <PlantManager p={plants} i18n={i18n} onToast={addToast} />
        )}
        {activePage === "groups" && (
          <GroupManager g={groups} onToast={addToast} />
        )}
        {activePage === "photos" && (
          <PhotoManager ph={photos} onToast={addToast} />
        )}
      </main>

      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
