import { useEffect, useMemo, useState } from "react";
import { ConvexHttpClient } from "convex/browser";

declare const __CONVEX_URL__: string;

type I18nRow = {
  locale: string;
  commonName: string;
  description?: string;
  careContent?: string;
  contentVersion?: number;
};

type Plant = {
  _id: string;
  scientificName: string;
  group: string;
  description?: string;
  imageUrl?: string | null;
  purposes?: string[];
  typicalDaysToHarvest?: number;
  wateringFrequencyDays?: number;
  lightRequirements?: string;
  germinationDays?: number;
  spacingCm?: number;
  maxPlantsPerM2?: number;
  seedRatePerM2?: number;
  waterLitersPerM2?: number;
  yieldKgPerM2?: number;
  source?: string;
  i18nRows: I18nRow[];
};

type PlantGroup = {
  _id: string;
  key: string;
  displayName: Record<string, string>;
  description?: Record<string, string>;
  iconUrl?: string;
  sortOrder: number;
};

type PlantI18nRow = {
  _id: string;
  plantId: string;
  locale: string;
  commonName: string;
  description?: string;
  careContent?: string;
  contentVersion?: number;
  plantScientificName?: string;
  plantGroup?: string;
};

type PlantPhoto = {
  _id: string;
  userPlantId: string;
  userId: string;
  localId?: string;
  photoUrl: string;
  thumbnailUrl?: string;
  storageId?: string;
  takenAt: number;
  uploadedAt: number;
  isPrimary: boolean;
  source: string;
  analysisStatus: string;
  analysisResult?: unknown;
  aiModelVersion?: string;
};

type FormState = {
  scientificName: string;
  group: string;
  description: string;
  imageUrl: string;
  purposes: string;
  viCommonName: string;
  viDescription: string;
  enCommonName: string;
  enDescription: string;
};

type GroupFormState = {
  key: string;
  displayNameVi: string;
  displayNameEn: string;
  descriptionVi: string;
  descriptionEn: string;
  iconUrl: string;
  sortOrder: string;
};

type I18nFormState = {
  plantId: string;
  locale: string;
  commonName: string;
  description: string;
  careContent: string;
  contentVersion: string;
};

type PhotoFormState = {
  userPlantId: string;
  userId: string;
  localId: string;
  photoUrl: string;
  thumbnailUrl: string;
  storageId: string;
  takenAt: string;
  uploadedAt: string;
  isPrimary: boolean;
  source: string;
  analysisStatus: string;
  analysisResult: string;
  aiModelVersion: string;
};

type Mode = "view" | "edit" | "create";

type TabKey = "plants" | "groups" | "i18n" | "photos";

const convex = new ConvexHttpClient(__CONVEX_URL__);

const emptyForm: FormState = {
  scientificName: "",
  group: "other",
  description: "",
  imageUrl: "",
  purposes: "",
  viCommonName: "",
  viDescription: "",
  enCommonName: "",
  enDescription: "",
};

const emptyGroupForm: GroupFormState = {
  key: "",
  displayNameVi: "",
  displayNameEn: "",
  descriptionVi: "",
  descriptionEn: "",
  iconUrl: "",
  sortOrder: "0",
};

const emptyI18nForm: I18nFormState = {
  plantId: "",
  locale: "",
  commonName: "",
  description: "",
  careContent: "",
  contentVersion: "",
};

const emptyPhotoForm: PhotoFormState = {
  userPlantId: "",
  userId: "",
  localId: "",
  photoUrl: "",
  thumbnailUrl: "",
  storageId: "",
  takenAt: "",
  uploadedAt: "",
  isPrimary: false,
  source: "camera",
  analysisStatus: "pending",
  analysisResult: "",
  aiModelVersion: "",
};

function getLocaleRow(rows: I18nRow[], locale: "vi" | "en") {
  return rows.find((row) => row.locale === locale);
}

function getDisplayName(plant: Plant) {
  const vi = getLocaleRow(plant.i18nRows, "vi")?.commonName;
  const en = getLocaleRow(plant.i18nRows, "en")?.commonName;
  return vi || en || plant.scientificName;
}

function toFormState(plant: Plant): FormState {
  const vi = getLocaleRow(plant.i18nRows, "vi");
  const en = getLocaleRow(plant.i18nRows, "en");
  return {
    scientificName: plant.scientificName ?? "",
    group: plant.group ?? "other",
    description: plant.description ?? "",
    imageUrl: plant.imageUrl ?? "",
    purposes: (plant.purposes ?? []).join(", "),
    viCommonName: vi?.commonName ?? "",
    viDescription: vi?.description ?? "",
    enCommonName: en?.commonName ?? "",
    enDescription: en?.description ?? "",
  };
}

function toGroupFormState(group: PlantGroup): GroupFormState {
  return {
    key: group.key,
    displayNameVi: group.displayName?.vi ?? "",
    displayNameEn: group.displayName?.en ?? "",
    descriptionVi: group.description?.vi ?? "",
    descriptionEn: group.description?.en ?? "",
    iconUrl: group.iconUrl ?? "",
    sortOrder: String(group.sortOrder ?? 0),
  };
}

function toI18nFormState(row: PlantI18nRow): I18nFormState {
  return {
    plantId: row.plantId,
    locale: row.locale,
    commonName: row.commonName ?? "",
    description: row.description ?? "",
    careContent: row.careContent ?? "",
    contentVersion: row.contentVersion ? String(row.contentVersion) : "",
  };
}

function toPhotoFormState(photo: PlantPhoto): PhotoFormState {
  return {
    userPlantId: photo.userPlantId,
    userId: photo.userId,
    localId: photo.localId ?? "",
    photoUrl: photo.photoUrl ?? "",
    thumbnailUrl: photo.thumbnailUrl ?? "",
    storageId: photo.storageId ?? "",
    takenAt: String(photo.takenAt ?? ""),
    uploadedAt: String(photo.uploadedAt ?? ""),
    isPrimary: photo.isPrimary,
    source: photo.source ?? "camera",
    analysisStatus: photo.analysisStatus ?? "pending",
    analysisResult: photo.analysisResult ? JSON.stringify(photo.analysisResult) : "",
    aiModelVersion: photo.aiModelVersion ?? "",
  };
}

function parsePurposes(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("plants");

  const [plants, setPlants] = useState<Plant[]>([]);
  const [groups, setGroups] = useState<PlantGroup[]>([]);
  const [i18nRows, setI18nRows] = useState<PlantI18nRow[]>([]);
  const [photos, setPhotos] = useState<PlantPhoto[]>([]);

  const [loadingPlants, setLoadingPlants] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingI18n, setLoadingI18n] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [plantMode, setPlantMode] = useState<Mode>("view");
  const [plantForm, setPlantForm] = useState<FormState>(emptyForm);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<Mode>("view");
  const [groupForm, setGroupForm] = useState<GroupFormState>(emptyGroupForm);

  const [selectedI18nId, setSelectedI18nId] = useState<string | null>(null);
  const [i18nMode, setI18nMode] = useState<Mode>("view");
  const [i18nForm, setI18nForm] = useState<I18nFormState>(emptyI18nForm);

  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [photoMode, setPhotoMode] = useState<Mode>("view");
  const [photoForm, setPhotoForm] = useState<PhotoFormState>(emptyPhotoForm);

  const [plantSearch, setPlantSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [i18nSearch, setI18nSearch] = useState("");
  const [photoSearch, setPhotoSearch] = useState("");

  const [groupFilter, setGroupFilter] = useState("all");
  const [filterMissingI18n, setFilterMissingI18n] = useState(false);
  const [filterNoImage, setFilterNoImage] = useState(false);

  const convexReady = useMemo(() => Boolean(__CONVEX_URL__), []);

  async function loadPlants() {
    if (!convexReady) {
      setError("Missing Convex URL. Set EXPO_PUBLIC_CONVEX_URL or VITE_CONVEX_URL.");
      return;
    }

    setLoadingPlants(true);
    setError("");
    try {
      const data = (await convex.query("plantAdmin:listPlants" as any, {})) as Plant[];
      setPlants(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot load plants");
    } finally {
      setLoadingPlants(false);
    }
  }

  async function loadGroups() {
    if (!convexReady) return;
    setLoadingGroups(true);
    setError("");
    try {
      const data = (await convex.query("plantAdmin:listPlantGroups" as any, {})) as PlantGroup[];
      setGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot load plant groups");
    } finally {
      setLoadingGroups(false);
    }
  }

  async function loadI18nRows() {
    if (!convexReady) return;
    setLoadingI18n(true);
    setError("");
    try {
      const data = (await convex.query("plantAdmin:listPlantI18n" as any, {})) as PlantI18nRow[];
      setI18nRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot load plant i18n");
    } finally {
      setLoadingI18n(false);
    }
  }

  async function loadPhotos() {
    if (!convexReady) return;
    setLoadingPhotos(true);
    setError("");
    try {
      const data = (await convex.query("plantAdmin:listPlantPhotos" as any, {})) as PlantPhoto[];
      setPhotos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot load plant photos");
    } finally {
      setLoadingPhotos(false);
    }
  }

  useEffect(() => {
    void loadPlants();
  }, []);

  useEffect(() => {
    if (activeTab === "groups" && groups.length === 0) {
      void loadGroups();
    }
    if (activeTab === "i18n" && i18nRows.length === 0) {
      void loadI18nRows();
    }
    if (activeTab === "photos" && photos.length === 0) {
      void loadPhotos();
    }
  }, [activeTab, groups.length, i18nRows.length, photos.length]);

  useEffect(() => {
    if (plantMode === "create") return;
    if (!selectedPlantId && plants.length > 0) {
      setSelectedPlantId(plants[0]._id);
      return;
    }
    if (selectedPlantId && !plants.find((p) => p._id === selectedPlantId)) {
      setSelectedPlantId(plants[0]?._id ?? null);
    }
  }, [plants, selectedPlantId, plantMode]);

  useEffect(() => {
    if (groupMode === "create") return;
    if (!selectedGroupId && groups.length > 0) {
      setSelectedGroupId(groups[0]._id);
      return;
    }
    if (selectedGroupId && !groups.find((g) => g._id === selectedGroupId)) {
      setSelectedGroupId(groups[0]?._id ?? null);
    }
  }, [groups, selectedGroupId, groupMode]);

  useEffect(() => {
    if (i18nMode === "create") return;
    if (!selectedI18nId && i18nRows.length > 0) {
      setSelectedI18nId(i18nRows[0]._id);
      return;
    }
    if (selectedI18nId && !i18nRows.find((row) => row._id === selectedI18nId)) {
      setSelectedI18nId(i18nRows[0]?._id ?? null);
    }
  }, [i18nRows, selectedI18nId, i18nMode]);

  useEffect(() => {
    if (photoMode === "create") return;
    if (!selectedPhotoId && photos.length > 0) {
      setSelectedPhotoId(photos[0]._id);
      return;
    }
    if (selectedPhotoId && !photos.find((p) => p._id === selectedPhotoId)) {
      setSelectedPhotoId(photos[0]?._id ?? null);
    }
  }, [photos, selectedPhotoId, photoMode]);

  const selectedPlant = useMemo(
    () => plants.find((plant) => plant._id === selectedPlantId) ?? null,
    [plants, selectedPlantId]
  );

  const selectedGroup = useMemo(
    () => groups.find((group) => group._id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  const selectedI18n = useMemo(
    () => i18nRows.find((row) => row._id === selectedI18nId) ?? null,
    [i18nRows, selectedI18nId]
  );

  const selectedPhoto = useMemo(
    () => photos.find((photo) => photo._id === selectedPhotoId) ?? null,
    [photos, selectedPhotoId]
  );

  const groupOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const plant of plants) {
      if (plant.group) unique.add(plant.group);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [plants]);

  const filteredPlants = useMemo(() => {
    const normalized = plantSearch.trim().toLowerCase();
    let result = plants.slice();

    if (groupFilter !== "all") {
      result = result.filter((plant) => plant.group === groupFilter);
    }

    if (filterMissingI18n) {
      result = result.filter((plant) => {
        const vi = getLocaleRow(plant.i18nRows, "vi");
        const en = getLocaleRow(plant.i18nRows, "en");
        return !vi || !en;
      });
    }

    if (filterNoImage) {
      result = result.filter((plant) => !plant.imageUrl);
    }

    if (normalized) {
      result = result.filter((plant) => {
        const vi = getLocaleRow(plant.i18nRows, "vi")?.commonName ?? "";
        const en = getLocaleRow(plant.i18nRows, "en")?.commonName ?? "";
        const haystack = [
          plant.scientificName,
          plant.group,
          plant.description ?? "",
          vi,
          en,
          ...(plant.purposes ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      });
    }

    return result.sort((a, b) => a.scientificName.localeCompare(b.scientificName));
  }, [plants, plantSearch, groupFilter, filterMissingI18n, filterNoImage]);

  const filteredGroups = useMemo(() => {
    const normalized = groupSearch.trim().toLowerCase();
    let result = groups.slice();
    if (normalized) {
      result = result.filter((group) => {
        const haystack = [
          group.key,
          group.displayName?.vi ?? "",
          group.displayName?.en ?? "",
          group.description?.vi ?? "",
          group.description?.en ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      });
    }
    return result.sort((a, b) => a.sortOrder - b.sortOrder);
  }, [groups, groupSearch]);

  const filteredI18n = useMemo(() => {
    const normalized = i18nSearch.trim().toLowerCase();
    let result = i18nRows.slice();
    if (normalized) {
      result = result.filter((row) => {
        const haystack = [
          row.plantScientificName ?? "",
          row.plantGroup ?? "",
          row.locale,
          row.commonName,
          row.description ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      });
    }
    return result.sort((a, b) => a.commonName.localeCompare(b.commonName));
  }, [i18nRows, i18nSearch]);

  const filteredPhotos = useMemo(() => {
    const normalized = photoSearch.trim().toLowerCase();
    let result = photos.slice();
    if (normalized) {
      result = result.filter((photo) => {
        const haystack = [
          photo.userPlantId,
          photo.userId,
          photo.photoUrl,
          photo.source,
          photo.analysisStatus,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      });
    }
    return result.sort((a, b) => b.takenAt - a.takenAt);
  }, [photos, photoSearch]);

  const stats = useMemo(() => {
    const missingI18n = plants.filter((plant) => {
      const vi = getLocaleRow(plant.i18nRows, "vi");
      const en = getLocaleRow(plant.i18nRows, "en");
      return !vi || !en;
    }).length;
    const missingImages = plants.filter((plant) => !plant.imageUrl).length;
    return {
      total: plants.length,
      missingI18n,
      missingImages,
    };
  }, [plants]);

  function selectPlant(plant: Plant) {
    setSelectedPlantId(plant._id);
    if (plantMode !== "create") {
      setPlantMode("view");
    }
  }

  function selectGroup(group: PlantGroup) {
    setSelectedGroupId(group._id);
    if (groupMode !== "create") {
      setGroupMode("view");
    }
  }

  function selectI18n(row: PlantI18nRow) {
    setSelectedI18nId(row._id);
    if (i18nMode !== "create") {
      setI18nMode("view");
    }
  }

  function selectPhoto(photo: PlantPhoto) {
    setSelectedPhotoId(photo._id);
    if (photoMode !== "create") {
      setPhotoMode("view");
    }
  }

  function startCreatePlant() {
    setPlantMode("create");
    setPlantForm(emptyForm);
    setSelectedPlantId(null);
    setError("");
  }

  function startCreateGroup() {
    setGroupMode("create");
    setGroupForm(emptyGroupForm);
    setSelectedGroupId(null);
    setError("");
  }

  function startCreateI18n() {
    setI18nMode("create");
    setI18nForm({
      ...emptyI18nForm,
      plantId: plants[0]?._id ?? "",
    });
    setSelectedI18nId(null);
    setError("");
  }

  function startCreatePhoto() {
    setPhotoMode("create");
    setPhotoForm({
      ...emptyPhotoForm,
      takenAt: String(Date.now()),
      uploadedAt: String(Date.now()),
    });
    setSelectedPhotoId(null);
    setError("");
  }

  function startEditPlant(plant: Plant) {
    setPlantMode("edit");
    setPlantForm(toFormState(plant));
    setSelectedPlantId(plant._id);
    setError("");
  }

  function startEditGroup(group: PlantGroup) {
    setGroupMode("edit");
    setGroupForm(toGroupFormState(group));
    setSelectedGroupId(group._id);
    setError("");
  }

  function startEditI18n(row: PlantI18nRow) {
    setI18nMode("edit");
    setI18nForm(toI18nFormState(row));
    setSelectedI18nId(row._id);
    setError("");
  }

  function startEditPhoto(photo: PlantPhoto) {
    setPhotoMode("edit");
    setPhotoForm(toPhotoFormState(photo));
    setSelectedPhotoId(photo._id);
    setError("");
  }

  function cancelPlantEdit() {
    if (selectedPlant) {
      setPlantForm(toFormState(selectedPlant));
      setPlantMode("view");
      return;
    }
    setPlantMode("view");
    setPlantForm(emptyForm);
  }

  function cancelGroupEdit() {
    if (selectedGroup) {
      setGroupForm(toGroupFormState(selectedGroup));
      setGroupMode("view");
      return;
    }
    setGroupMode("view");
    setGroupForm(emptyGroupForm);
  }

  function cancelI18nEdit() {
    if (selectedI18n) {
      setI18nForm(toI18nFormState(selectedI18n));
      setI18nMode("view");
      return;
    }
    setI18nMode("view");
    setI18nForm(emptyI18nForm);
  }

  function cancelPhotoEdit() {
    if (selectedPhoto) {
      setPhotoForm(toPhotoFormState(selectedPhoto));
      setPhotoMode("view");
      return;
    }
    setPhotoMode("view");
    setPhotoForm(emptyPhotoForm);
  }

  async function savePlant() {
    if (saving) return;

    const payload = {
      scientificName: plantForm.scientificName.trim(),
      group: plantForm.group.trim() || "other",
      description: plantForm.description.trim() || undefined,
      imageUrl: plantForm.imageUrl.trim() ? plantForm.imageUrl.trim() : null,
      purposes: parsePurposes(plantForm.purposes),
      viCommonName: plantForm.viCommonName.trim(),
      viDescription: plantForm.viDescription.trim() || undefined,
      enCommonName: plantForm.enCommonName.trim(),
      enDescription: plantForm.enDescription.trim() || undefined,
    };

    if (!payload.scientificName) {
      setError("Scientific name is required.");
      return;
    }
    if (!payload.viCommonName || !payload.enCommonName) {
      setError("Both VI and EN common names are required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (plantMode === "create") {
        const result = (await convex.mutation("plantAdmin:createPlant" as any, payload)) as {
          plantId: string;
        };
        await loadPlants();
        setSelectedPlantId(result.plantId);
        setPlantMode("view");
      } else if (plantMode === "edit" && selectedPlant) {
        await convex.mutation("plantAdmin:updatePlant" as any, {
          plantId: selectedPlant._id,
          ...payload,
        });
        await loadPlants();
        setPlantMode("view");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot save plant");
    } finally {
      setSaving(false);
    }
  }

  async function saveGroup() {
    if (saving) return;

    const sortOrder = Number(groupForm.sortOrder);
    if (!groupForm.key.trim()) {
      setError("Group key is required.");
      return;
    }
    if (!groupForm.displayNameVi.trim() || !groupForm.displayNameEn.trim()) {
      setError("Both VI and EN display names are required.");
      return;
    }
    if (!Number.isFinite(sortOrder)) {
      setError("Sort order must be a number.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        key: groupForm.key.trim(),
        displayNameVi: groupForm.displayNameVi.trim(),
        displayNameEn: groupForm.displayNameEn.trim(),
        descriptionVi: groupForm.descriptionVi.trim() || undefined,
        descriptionEn: groupForm.descriptionEn.trim() || undefined,
        iconUrl: groupForm.iconUrl.trim() || undefined,
        sortOrder,
      };

      if (groupMode === "create") {
        const result = (await convex.mutation("plantAdmin:createPlantGroup" as any, payload)) as {
          groupId: string;
        };
        await loadGroups();
        setSelectedGroupId(result.groupId);
        setGroupMode("view");
      } else if (groupMode === "edit" && selectedGroup) {
        await convex.mutation("plantAdmin:updatePlantGroup" as any, {
          groupId: selectedGroup._id,
          ...payload,
        });
        await loadGroups();
        setGroupMode("view");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot save group");
    } finally {
      setSaving(false);
    }
  }

  async function saveI18n() {
    if (saving) return;
    if (!i18nForm.plantId) {
      setError("Plant is required.");
      return;
    }
    if (!i18nForm.locale.trim()) {
      setError("Locale is required.");
      return;
    }
    if (!i18nForm.commonName.trim()) {
      setError("Common name is required.");
      return;
    }

    const contentVersion = i18nForm.contentVersion.trim()
      ? Number(i18nForm.contentVersion)
      : undefined;
    if (i18nForm.contentVersion.trim() && !Number.isFinite(contentVersion)) {
      setError("Content version must be a number.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        plantId: i18nForm.plantId as any,
        locale: i18nForm.locale.trim(),
        commonName: i18nForm.commonName.trim(),
        description: i18nForm.description.trim() || undefined,
        careContent: i18nForm.careContent.trim() || undefined,
        contentVersion,
      };

      if (i18nMode === "create") {
        const result = (await convex.mutation("plantAdmin:createPlantI18n" as any, payload)) as {
          rowId: string;
        };
        await loadI18nRows();
        setSelectedI18nId(result.rowId);
        setI18nMode("view");
      } else if (i18nMode === "edit" && selectedI18n) {
        await convex.mutation("plantAdmin:updatePlantI18n" as any, {
          rowId: selectedI18n._id,
          ...payload,
        });
        await loadI18nRows();
        setI18nMode("view");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot save i18n row");
    } finally {
      setSaving(false);
    }
  }

  async function savePhoto() {
    if (saving) return;
    if (!photoForm.userPlantId.trim() || !photoForm.userId.trim()) {
      setError("User plant id and user id are required.");
      return;
    }
    if (!photoForm.photoUrl.trim()) {
      setError("Photo URL is required.");
      return;
    }

    const takenAt = Number(photoForm.takenAt);
    const uploadedAt = Number(photoForm.uploadedAt);
    if (!Number.isFinite(takenAt) || !Number.isFinite(uploadedAt)) {
      setError("Taken at and uploaded at must be numbers (ms timestamp).");
      return;
    }

    let analysisResult: unknown = undefined;
    if (photoForm.analysisResult.trim()) {
      try {
        analysisResult = JSON.parse(photoForm.analysisResult);
      } catch (err) {
        setError("Analysis result must be valid JSON.");
        return;
      }
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        userPlantId: photoForm.userPlantId.trim() as any,
        userId: photoForm.userId.trim() as any,
        localId: photoForm.localId.trim() || undefined,
        photoUrl: photoForm.photoUrl.trim(),
        thumbnailUrl: photoForm.thumbnailUrl.trim() || undefined,
        storageId: photoForm.storageId.trim() ? (photoForm.storageId.trim() as any) : undefined,
        takenAt,
        uploadedAt,
        isPrimary: photoForm.isPrimary,
        source: photoForm.source.trim(),
        analysisStatus: photoForm.analysisStatus.trim(),
        analysisResult,
        aiModelVersion: photoForm.aiModelVersion.trim() || undefined,
      };

      if (photoMode === "create") {
        const result = (await convex.mutation("plantAdmin:createPlantPhoto" as any, payload)) as {
          photoId: string;
        };
        await loadPhotos();
        setSelectedPhotoId(result.photoId);
        setPhotoMode("view");
      } else if (photoMode === "edit" && selectedPhoto) {
        await convex.mutation("plantAdmin:updatePlantPhoto" as any, {
          photoId: selectedPhoto._id,
          ...payload,
        });
        await loadPhotos();
        setPhotoMode("view");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot save photo");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePlant() {
    if (!selectedPlant) return;
    const confirmed = window.confirm(
      `Delete ${getDisplayName(selectedPlant)}? This will remove all i18n entries too.`
    );
    if (!confirmed) return;

    setSaving(true);
    setError("");
    try {
      await convex.mutation("plantAdmin:deletePlant" as any, {
        plantId: selectedPlant._id,
      });
      await loadPlants();
      setPlantMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot delete plant");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGroup() {
    if (!selectedGroup) return;
    const confirmed = window.confirm(`Delete group ${selectedGroup.key}?`);
    if (!confirmed) return;

    setSaving(true);
    setError("");
    try {
      await convex.mutation("plantAdmin:deletePlantGroup" as any, {
        groupId: selectedGroup._id,
      });
      await loadGroups();
      setGroupMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot delete group");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteI18n() {
    if (!selectedI18n) return;
    const confirmed = window.confirm(`Delete i18n row ${selectedI18n.commonName}?`);
    if (!confirmed) return;

    setSaving(true);
    setError("");
    try {
      await convex.mutation("plantAdmin:deletePlantI18n" as any, {
        rowId: selectedI18n._id,
      });
      await loadI18nRows();
      setI18nMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot delete i18n row");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePhoto() {
    if (!selectedPhoto) return;
    const confirmed = window.confirm(`Delete photo ${selectedPhoto._id}?`);
    if (!confirmed) return;

    setSaving(true);
    setError("");
    try {
      await convex.mutation("plantAdmin:deletePlantPhoto" as any, {
        photoId: selectedPhoto._id,
      });
      await loadPhotos();
      setPhotoMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot delete photo");
    } finally {
      setSaving(false);
    }
  }

  function renderI18nBadge(plant: Plant, locale: "vi" | "en") {
    const row = getLocaleRow(plant.i18nRows, locale);
    const ok = Boolean(row?.commonName);
    return (
      <span className={`badge ${ok ? "ok" : "warn"}`}>
        {locale.toUpperCase()}
      </span>
    );
  }

  return (
    <main className="container">
      <header className="header">
        <div>
          <p className="kicker">Master Plant Data</p>
          <h1>Plant Dashboard</h1>
          <div className="meta">
            <span>Total: {stats.total}</span>
            <span>Missing i18n: {stats.missingI18n}</span>
            <span>Missing images: {stats.missingImages}</span>
          </div>
        </div>
        <div className="actions">
          <button
            className="secondary"
            onClick={() => {
              if (activeTab === "plants") void loadPlants();
              if (activeTab === "groups") void loadGroups();
              if (activeTab === "i18n") void loadI18nRows();
              if (activeTab === "photos") void loadPhotos();
            }}
            disabled={loadingPlants || loadingGroups || loadingI18n || loadingPhotos}
          >
            Refresh
          </button>
          {activeTab === "plants" ? <button onClick={startCreatePlant}>New Plant</button> : null}
          {activeTab === "groups" ? <button onClick={startCreateGroup}>New Group</button> : null}
          {activeTab === "i18n" ? <button onClick={startCreateI18n}>New i18n</button> : null}
          {activeTab === "photos" ? <button onClick={startCreatePhoto}>New Photo</button> : null}
        </div>
      </header>

      <div className="tabs">
        {[
          { key: "plants", label: "plantsMaster" },
          { key: "i18n", label: "plantI18n" },
          { key: "groups", label: "plantGroups" },
          { key: "photos", label: "plantPhotos" },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key as TabKey)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}

      {activeTab === "plants" ? (
        <div className="layout">
          <section className="card">
            <div className="section-title">
              <h2>Plants Master</h2>
              <span className="muted">{filteredPlants.length} results</span>
            </div>
            <div className="filters">
              <input
                placeholder="Search by name, scientific, group, purpose..."
                value={plantSearch}
                onChange={(e) => setPlantSearch(e.target.value)}
              />
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="all">All groups</option>
                {groupOptions.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={filterMissingI18n}
                  onChange={(e) => setFilterMissingI18n(e.target.checked)}
                />
                Missing i18n
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={filterNoImage}
                  onChange={(e) => setFilterNoImage(e.target.checked)}
                />
                Missing image
              </label>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Group</th>
                    <th>I18n</th>
                    <th>Image</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlants.map((plant) => (
                    <tr
                      key={plant._id}
                      className={plant._id === selectedPlantId ? "selected" : ""}
                      onClick={() => selectPlant(plant)}
                    >
                      <td>
                        <div className="row-title">{getDisplayName(plant)}</div>
                        <div className="row-sub">{plant.scientificName}</div>
                      </td>
                      <td>
                        <span className="pill">{plant.group}</span>
                      </td>
                      <td className="badge-group">
                        {renderI18nBadge(plant, "vi")}
                        {renderI18nBadge(plant, "en")}
                      </td>
                      <td>{plant.imageUrl ? "Yes" : "No"}</td>
                      <td>
                        <button
                          className="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditPlant(plant);
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPlants.length === 0 ? (
                <p className="empty">No plants found for current filters.</p>
              ) : null}
            </div>
          </section>

          <section className="card">
            <div className="section-title">
              <h2>
                {plantMode === "create"
                  ? "Create Plant"
                  : plantMode === "edit"
                    ? "Edit Plant"
                    : "Plant Details"}
              </h2>
              {plantMode === "view" && selectedPlant ? (
                <div className="actions">
                  <button className="secondary" onClick={() => startEditPlant(selectedPlant)}>
                    Edit
                  </button>
                  <button className="danger" onClick={() => void handleDeletePlant()} disabled={saving}>
                    Delete
                  </button>
                </div>
              ) : null}
            </div>

            {plantMode === "view" ? (
              selectedPlant ? (
                <div className="detail">
                  <div className="detail-header">
                    <div>
                      <h3>{getDisplayName(selectedPlant)}</h3>
                      <p className="muted">{selectedPlant.scientificName}</p>
                      <div className="badge-group">
                        {renderI18nBadge(selectedPlant, "vi")}
                        {renderI18nBadge(selectedPlant, "en")}
                        <span className={`badge ${selectedPlant.imageUrl ? "ok" : "warn"}`}>
                          Image
                        </span>
                      </div>
                    </div>
                    {selectedPlant.imageUrl ? (
                      <img src={selectedPlant.imageUrl} alt="plant" className="thumb" />
                    ) : (
                      <div className="thumb placeholder">No image</div>
                    )}
                  </div>

                  <div className="detail-grid">
                    <div>
                      <h4>Overview</h4>
                      <p className="muted">Group: {selectedPlant.group}</p>
                      <p>{selectedPlant.description || "No description"}</p>
                      <p className="muted">
                        Purposes: {(selectedPlant.purposes ?? []).length > 0 ? selectedPlant.purposes?.join(", ") : "—"}
                      </p>
                      <p className="muted">Source: {selectedPlant.source ?? "—"}</p>
                    </div>
                    <div>
                      <h4>Growth</h4>
                      <ul className="meta-list">
                        <li>Days to harvest: {selectedPlant.typicalDaysToHarvest ?? "—"}</li>
                        <li>Watering (days): {selectedPlant.wateringFrequencyDays ?? "—"}</li>
                        <li>Light: {selectedPlant.lightRequirements ?? "—"}</li>
                        <li>Germination: {selectedPlant.germinationDays ?? "—"}</li>
                        <li>Spacing (cm): {selectedPlant.spacingCm ?? "—"}</li>
                        <li>Max plants/m2: {selectedPlant.maxPlantsPerM2 ?? "—"}</li>
                        <li>Seed rate/m2: {selectedPlant.seedRatePerM2 ?? "—"}</li>
                        <li>Water liters/m2: {selectedPlant.waterLitersPerM2 ?? "—"}</li>
                        <li>Yield kg/m2: {selectedPlant.yieldKgPerM2 ?? "—"}</li>
                      </ul>
                    </div>
                  </div>

                  <div className="i18n-section">
                    <div>
                      <h4>Vietnamese</h4>
                      <p className="muted">{getLocaleRow(selectedPlant.i18nRows, "vi")?.commonName ?? "Missing"}</p>
                      <p>{getLocaleRow(selectedPlant.i18nRows, "vi")?.description ?? "No description"}</p>
                    </div>
                    <div>
                      <h4>English</h4>
                      <p className="muted">{getLocaleRow(selectedPlant.i18nRows, "en")?.commonName ?? "Missing"}</p>
                      <p>{getLocaleRow(selectedPlant.i18nRows, "en")?.description ?? "No description"}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="empty">Select a plant to see details.</p>
              )
            ) : (
              <div className="form">
                <div className="grid-2">
                  <label>
                    Vietnamese common name
                    <input
                      value={plantForm.viCommonName}
                      onChange={(e) => setPlantForm({ ...plantForm, viCommonName: e.target.value })}
                    />
                  </label>
                  <label>
                    English common name
                    <input
                      value={plantForm.enCommonName}
                      onChange={(e) => setPlantForm({ ...plantForm, enCommonName: e.target.value })}
                    />
                  </label>
                </div>
                <div className="grid-2">
                  <label>
                    Vietnamese description
                    <textarea
                      rows={3}
                      value={plantForm.viDescription}
                      onChange={(e) => setPlantForm({ ...plantForm, viDescription: e.target.value })}
                    />
                  </label>
                  <label>
                    English description
                    <textarea
                      rows={3}
                      value={plantForm.enDescription}
                      onChange={(e) => setPlantForm({ ...plantForm, enDescription: e.target.value })}
                    />
                  </label>
                </div>
                <div className="grid-2">
                  <label>
                    Scientific name
                    <input
                      value={plantForm.scientificName}
                      onChange={(e) => setPlantForm({ ...plantForm, scientificName: e.target.value })}
                    />
                  </label>
                  <label>
                    Group
                    <input
                      value={plantForm.group}
                      onChange={(e) => setPlantForm({ ...plantForm, group: e.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Description
                  <textarea
                    rows={3}
                    value={plantForm.description}
                    onChange={(e) => setPlantForm({ ...plantForm, description: e.target.value })}
                  />
                </label>
                <label>
                  Purposes (comma separated)
                  <input
                    value={plantForm.purposes}
                    onChange={(e) => setPlantForm({ ...plantForm, purposes: e.target.value })}
                  />
                </label>
                <label>
                  Image URL
                  <input
                    value={plantForm.imageUrl}
                    onChange={(e) => setPlantForm({ ...plantForm, imageUrl: e.target.value })}
                  />
                </label>

                <div className="form-actions">
                  <button className="secondary" onClick={cancelPlantEdit} type="button">
                    Cancel
                  </button>
                  <button onClick={() => void savePlant()} disabled={saving} type="button">
                    {saving ? "Saving..." : plantMode === "create" ? "Create" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {activeTab === "groups" ? (
        <div className="layout">
          <section className="card">
            <div className="section-title">
              <h2>Plant Groups</h2>
              <span className="muted">{filteredGroups.length} results</span>
            </div>
            <div className="filters">
              <input
                placeholder="Search group key, display name..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Display</th>
                    <th>Order</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((group) => (
                    <tr
                      key={group._id}
                      className={group._id === selectedGroupId ? "selected" : ""}
                      onClick={() => selectGroup(group)}
                    >
                      <td>
                        <div className="row-title">{group.key}</div>
                        <div className="row-sub">{group.iconUrl || "No icon"}</div>
                      </td>
                      <td>
                        <div className="row-title">{group.displayName?.vi ?? "—"}</div>
                        <div className="row-sub">{group.displayName?.en ?? "—"}</div>
                      </td>
                      <td>{group.sortOrder}</td>
                      <td>
                        <button
                          className="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditGroup(group);
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredGroups.length === 0 ? (
                <p className="empty">No groups found.</p>
              ) : null}
            </div>
          </section>

          <section className="card">
            <div className="section-title">
              <h2>
                {groupMode === "create"
                  ? "Create Group"
                  : groupMode === "edit"
                    ? "Edit Group"
                    : "Group Details"}
              </h2>
              {groupMode === "view" && selectedGroup ? (
                <div className="actions">
                  <button className="secondary" onClick={() => startEditGroup(selectedGroup)}>
                    Edit
                  </button>
                  <button className="danger" onClick={() => void handleDeleteGroup()} disabled={saving}>
                    Delete
                  </button>
                </div>
              ) : null}
            </div>

            {groupMode === "view" ? (
              selectedGroup ? (
                <div className="detail">
                  <div>
                    <h3>{selectedGroup.key}</h3>
                    <p className="muted">Order: {selectedGroup.sortOrder}</p>
                    <p className="muted">Icon: {selectedGroup.iconUrl ?? "—"}</p>
                  </div>
                  <div className="i18n-section">
                    <div>
                      <h4>Vietnamese</h4>
                      <p className="muted">{selectedGroup.displayName?.vi ?? "—"}</p>
                      <p>{selectedGroup.description?.vi ?? "No description"}</p>
                    </div>
                    <div>
                      <h4>English</h4>
                      <p className="muted">{selectedGroup.displayName?.en ?? "—"}</p>
                      <p>{selectedGroup.description?.en ?? "No description"}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="empty">Select a group to see details.</p>
              )
            ) : (
              <div className="form">
                <div className="grid-2">
                  <label>
                    Key
                    <input
                      value={groupForm.key}
                      onChange={(e) => setGroupForm({ ...groupForm, key: e.target.value })}
                    />
                  </label>
                  <label>
                    Sort order
                    <input
                      value={groupForm.sortOrder}
                      onChange={(e) => setGroupForm({ ...groupForm, sortOrder: e.target.value })}
                    />
                  </label>
                </div>
                <div className="grid-2">
                  <label>
                    Display name (VI)
                    <input
                      value={groupForm.displayNameVi}
                      onChange={(e) => setGroupForm({ ...groupForm, displayNameVi: e.target.value })}
                    />
                  </label>
                  <label>
                    Display name (EN)
                    <input
                      value={groupForm.displayNameEn}
                      onChange={(e) => setGroupForm({ ...groupForm, displayNameEn: e.target.value })}
                    />
                  </label>
                </div>
                <div className="grid-2">
                  <label>
                    Description (VI)
                    <textarea
                      rows={3}
                      value={groupForm.descriptionVi}
                      onChange={(e) => setGroupForm({ ...groupForm, descriptionVi: e.target.value })}
                    />
                  </label>
                  <label>
                    Description (EN)
                    <textarea
                      rows={3}
                      value={groupForm.descriptionEn}
                      onChange={(e) => setGroupForm({ ...groupForm, descriptionEn: e.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Icon URL
                  <input
                    value={groupForm.iconUrl}
                    onChange={(e) => setGroupForm({ ...groupForm, iconUrl: e.target.value })}
                  />
                </label>

                <div className="form-actions">
                  <button className="secondary" onClick={cancelGroupEdit} type="button">
                    Cancel
                  </button>
                  <button onClick={() => void saveGroup()} disabled={saving} type="button">
                    {saving ? "Saving..." : groupMode === "create" ? "Create" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {activeTab === "i18n" ? (
        <div className="layout">
          <section className="card">
            <div className="section-title">
              <h2>Plant i18n</h2>
              <span className="muted">{filteredI18n.length} results</span>
            </div>
            <div className="filters">
              <input
                placeholder="Search plant, locale, common name..."
                value={i18nSearch}
                onChange={(e) => setI18nSearch(e.target.value)}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Plant</th>
                    <th>Locale</th>
                    <th>Common name</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredI18n.map((row) => (
                    <tr
                      key={row._id}
                      className={row._id === selectedI18nId ? "selected" : ""}
                      onClick={() => selectI18n(row)}
                    >
                      <td>
                        <div className="row-title">{row.plantScientificName || row.plantId}</div>
                        <div className="row-sub">{row.plantGroup || ""}</div>
                      </td>
                      <td>{row.locale}</td>
                      <td>
                        <div className="row-title">{row.commonName}</div>
                        <div className="row-sub">{row.description || ""}</div>
                      </td>
                      <td>
                        <button
                          className="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditI18n(row);
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredI18n.length === 0 ? (
                <p className="empty">No i18n rows found.</p>
              ) : null}
            </div>
          </section>

          <section className="card">
            <div className="section-title">
              <h2>
                {i18nMode === "create"
                  ? "Create i18n"
                  : i18nMode === "edit"
                    ? "Edit i18n"
                    : "i18n Details"}
              </h2>
              {i18nMode === "view" && selectedI18n ? (
                <div className="actions">
                  <button className="secondary" onClick={() => startEditI18n(selectedI18n)}>
                    Edit
                  </button>
                  <button className="danger" onClick={() => void handleDeleteI18n()} disabled={saving}>
                    Delete
                  </button>
                </div>
              ) : null}
            </div>

            {i18nMode === "view" ? (
              selectedI18n ? (
                <div className="detail">
                  <div>
                    <h3>{selectedI18n.commonName}</h3>
                    <p className="muted">
                      {selectedI18n.plantScientificName || selectedI18n.plantId} ({selectedI18n.locale})
                    </p>
                  </div>
                  <div>
                    <p>{selectedI18n.description || "No description"}</p>
                    <p className="muted">Content version: {selectedI18n.contentVersion ?? "—"}</p>
                  </div>
                  <div>
                    <h4>Care content JSON</h4>
                    <pre className="code-block">{selectedI18n.careContent || "—"}</pre>
                  </div>
                </div>
              ) : (
                <p className="empty">Select a row to see details.</p>
              )
            ) : (
              <div className="form">
                <label>
                  Plant
                  <select
                    value={i18nForm.plantId}
                    onChange={(e) => setI18nForm({ ...i18nForm, plantId: e.target.value })}
                  >
                    {plants.map((plant) => (
                      <option key={plant._id} value={plant._id}>
                        {plant.scientificName}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid-2">
                  <label>
                    Locale
                    <input
                      value={i18nForm.locale}
                      onChange={(e) => setI18nForm({ ...i18nForm, locale: e.target.value })}
                    />
                  </label>
                  <label>
                    Content version
                    <input
                      value={i18nForm.contentVersion}
                      onChange={(e) => setI18nForm({ ...i18nForm, contentVersion: e.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Common name
                  <input
                    value={i18nForm.commonName}
                    onChange={(e) => setI18nForm({ ...i18nForm, commonName: e.target.value })}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    rows={3}
                    value={i18nForm.description}
                    onChange={(e) => setI18nForm({ ...i18nForm, description: e.target.value })}
                  />
                </label>
                <label>
                  Care content (JSON)
                  <textarea
                    rows={6}
                    value={i18nForm.careContent}
                    onChange={(e) => setI18nForm({ ...i18nForm, careContent: e.target.value })}
                  />
                </label>

                <div className="form-actions">
                  <button className="secondary" onClick={cancelI18nEdit} type="button">
                    Cancel
                  </button>
                  <button onClick={() => void saveI18n()} disabled={saving} type="button">
                    {saving ? "Saving..." : i18nMode === "create" ? "Create" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {activeTab === "photos" ? (
        <div className="layout">
          <section className="card">
            <div className="section-title">
              <h2>Plant Photos</h2>
              <span className="muted">{filteredPhotos.length} results</span>
            </div>
            <div className="filters">
              <input
                placeholder="Search plant id, user id, status..."
                value={photoSearch}
                onChange={(e) => setPhotoSearch(e.target.value)}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>User Plant</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPhotos.map((photo) => (
                    <tr
                      key={photo._id}
                      className={photo._id === selectedPhotoId ? "selected" : ""}
                      onClick={() => selectPhoto(photo)}
                    >
                      <td>
                        <div className="row-title">{photo.photoUrl}</div>
                        <div className="row-sub">{new Date(photo.takenAt).toLocaleString()}</div>
                      </td>
                      <td>
                        <div className="row-title">{photo.userPlantId}</div>
                        <div className="row-sub">{photo.userId}</div>
                      </td>
                      <td>
                        <div className="row-title">{photo.analysisStatus}</div>
                        <div className="row-sub">{photo.source}</div>
                      </td>
                      <td>
                        <button
                          className="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditPhoto(photo);
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPhotos.length === 0 ? (
                <p className="empty">No photos found.</p>
              ) : null}
            </div>
          </section>

          <section className="card">
            <div className="section-title">
              <h2>
                {photoMode === "create"
                  ? "Create Photo"
                  : photoMode === "edit"
                    ? "Edit Photo"
                    : "Photo Details"}
              </h2>
              {photoMode === "view" && selectedPhoto ? (
                <div className="actions">
                  <button className="secondary" onClick={() => startEditPhoto(selectedPhoto)}>
                    Edit
                  </button>
                  <button className="danger" onClick={() => void handleDeletePhoto()} disabled={saving}>
                    Delete
                  </button>
                </div>
              ) : null}
            </div>

            {photoMode === "view" ? (
              selectedPhoto ? (
                <div className="detail">
                  <div>
                    <h3>{selectedPhoto.photoUrl}</h3>
                    <p className="muted">User plant: {selectedPhoto.userPlantId}</p>
                    <p className="muted">User: {selectedPhoto.userId}</p>
                    <p className="muted">Status: {selectedPhoto.analysisStatus}</p>
                  </div>
                  <div>
                    <p>Source: {selectedPhoto.source}</p>
                    <p>Primary: {selectedPhoto.isPrimary ? "Yes" : "No"}</p>
                    <p>Taken: {new Date(selectedPhoto.takenAt).toLocaleString()}</p>
                    <p>Uploaded: {new Date(selectedPhoto.uploadedAt).toLocaleString()}</p>
                    <p>Storage ID: {selectedPhoto.storageId ?? "—"}</p>
                  </div>
                  <div>
                    <h4>Analysis Result</h4>
                    <pre className="code-block">
                      {selectedPhoto.analysisResult
                        ? JSON.stringify(selectedPhoto.analysisResult, null, 2)
                        : "—"}
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="empty">Select a photo to see details.</p>
              )
            ) : (
              <div className="form">
                <div className="grid-2">
                  <label>
                    User plant id
                    <input
                      value={photoForm.userPlantId}
                      onChange={(e) => setPhotoForm({ ...photoForm, userPlantId: e.target.value })}
                    />
                  </label>
                  <label>
                    User id
                    <input
                      value={photoForm.userId}
                      onChange={(e) => setPhotoForm({ ...photoForm, userId: e.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Photo URL
                  <input
                    value={photoForm.photoUrl}
                    onChange={(e) => setPhotoForm({ ...photoForm, photoUrl: e.target.value })}
                  />
                </label>
                <div className="grid-2">
                  <label>
                    Taken at (ms)
                    <input
                      value={photoForm.takenAt}
                      onChange={(e) => setPhotoForm({ ...photoForm, takenAt: e.target.value })}
                    />
                  </label>
                  <label>
                    Uploaded at (ms)
                    <input
                      value={photoForm.uploadedAt}
                      onChange={(e) => setPhotoForm({ ...photoForm, uploadedAt: e.target.value })}
                    />
                  </label>
                </div>
                <div className="grid-2">
                  <label>
                    Source
                    <input
                      value={photoForm.source}
                      onChange={(e) => setPhotoForm({ ...photoForm, source: e.target.value })}
                    />
                  </label>
                  <label>
                    Analysis status
                    <input
                      value={photoForm.analysisStatus}
                      onChange={(e) => setPhotoForm({ ...photoForm, analysisStatus: e.target.value })}
                    />
                  </label>
                </div>
                <div className="grid-2">
                  <label>
                    Thumbnail URL
                    <input
                      value={photoForm.thumbnailUrl}
                      onChange={(e) => setPhotoForm({ ...photoForm, thumbnailUrl: e.target.value })}
                    />
                  </label>
                  <label>
                    Storage ID
                    <input
                      value={photoForm.storageId}
                      onChange={(e) => setPhotoForm({ ...photoForm, storageId: e.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Analysis result (JSON)
                  <textarea
                    rows={4}
                    value={photoForm.analysisResult}
                    onChange={(e) => setPhotoForm({ ...photoForm, analysisResult: e.target.value })}
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={photoForm.isPrimary}
                    onChange={(e) => setPhotoForm({ ...photoForm, isPrimary: e.target.checked })}
                  />
                  Primary photo
                </label>
                <label>
                  AI model version
                  <input
                    value={photoForm.aiModelVersion}
                    onChange={(e) => setPhotoForm({ ...photoForm, aiModelVersion: e.target.value })}
                  />
                </label>
                <label>
                  Local ID
                  <input
                    value={photoForm.localId}
                    onChange={(e) => setPhotoForm({ ...photoForm, localId: e.target.value })}
                  />
                </label>

                <div className="form-actions">
                  <button className="secondary" onClick={cancelPhotoEdit} type="button">
                    Cancel
                  </button>
                  <button onClick={() => void savePhoto()} disabled={saving} type="button">
                    {saving ? "Saving..." : photoMode === "create" ? "Create" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
