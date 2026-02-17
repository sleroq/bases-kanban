import type { BasesEntry, BasesEntryGroup, BasesPropertyId } from "obsidian";

import { getColumnKey } from "./utils";

export type DisplaySettings = {
  cardTitleSource: string;
  cardTitleMaxLength: number;
  propertyValueSeparator: string;
  tagPropertySuffix: string;
  tagSaturation: number;
  tagLightness: number;
  tagAlpha: number;
};

export type RenderedGroup = {
  group: BasesEntryGroup;
  entries: BasesEntry[];
};

export type ColumnSnapshot = Map<string, string[]>;

export type PartialRenderResult = {
  canPartial: boolean;
  changedColumns: string[];
};

/**
 * Merge groups that share the same column key.
 * Groups with the same normalized key are combined into one.
 */
export function mergeGroupsByColumnKey(
  groups: BasesEntryGroup[],
): BasesEntryGroup[] {
  const mergedByColumnKey = new Map<string, BasesEntryGroup>();

  for (const group of groups) {
    const columnKey = getColumnKey(group.key);
    const existing = mergedByColumnKey.get(columnKey);
    if (existing === undefined) {
      mergedByColumnKey.set(columnKey, {
        key: group.key,
        hasKey: group.hasKey,
        entries: [...group.entries],
      });
      continue;
    }

    existing.hasKey = existing.hasKey || group.hasKey;
    existing.entries.push(...group.entries);
  }

  return [...mergedByColumnKey.values()];
}

/**
 * Sort groups according to the configured column order.
 * Groups not in the order config are placed at the end.
 */
export function sortGroupsByColumnOrder(
  groups: BasesEntryGroup[],
  columnOrder: string[],
): BasesEntryGroup[] {
  if (columnOrder.length === 0) {
    return groups;
  }

  const orderMap = new Map(
    columnOrder.map((columnKey, index) => [columnKey, index]),
  );
  return [...groups].sort((groupA, groupB) => {
    const indexA =
      orderMap.get(getColumnKey(groupA.key)) ?? Number.POSITIVE_INFINITY;
    const indexB =
      orderMap.get(getColumnKey(groupB.key)) ?? Number.POSITIVE_INFINITY;
    if (
      indexA === Number.POSITIVE_INFINITY &&
      indexB === Number.POSITIVE_INFINITY
    ) {
      return 0;
    }

    return indexA - indexB;
  });
}

/**
 * Apply local card order to entries within a column.
 * Entries are reordered according to the saved order, with new entries prepended.
 */
export function applyLocalCardOrder(
  columnKey: string,
  entries: BasesEntry[],
  localOrderByColumn: Map<string, string[]>,
): BasesEntry[] {
  const orderedPaths = localOrderByColumn.get(columnKey);
  if (orderedPaths === undefined || orderedPaths.length === 0) {
    return entries;
  }

  const entryByPath = new Map(
    entries.map((entry) => [entry.file.path, entry]),
  );
  const nextEntries: BasesEntry[] = [];
  const usedPaths = new Set<string>();

  for (const path of orderedPaths) {
    const entry = entryByPath.get(path);
    if (entry === undefined) {
      continue;
    }

    nextEntries.push(entry);
    usedPaths.add(path);
  }

  const newEntries: BasesEntry[] = [];
  for (const entry of entries) {
    if (usedPaths.has(entry.file.path)) {
      continue;
    }

    newEntries.push(entry);
  }

  nextEntries.unshift(...newEntries);

  return nextEntries;
}

/**
 * Build rendered groups by applying local card order to each column.
 */
export function buildRenderedGroups(
  orderedGroups: BasesEntryGroup[],
  localCardOrderByColumn: Map<string, string[]>,
): RenderedGroup[] {
  return orderedGroups.map((group) => ({
    group,
    entries: applyLocalCardOrder(
      getColumnKey(group.key),
      group.entries,
      localCardOrderByColumn,
    ),
  }));
}

/**
 * Compute a hash of property values for visible properties.
 * Used to detect when card properties (like tags) change.
 */
export function computePropertyValuesHash(
  groups: BasesEntryGroup[],
  propertiesToTrack: BasesPropertyId[],
): string {
  if (propertiesToTrack.length === 0) {
    return "";
  }

  const parts: string[] = [];

  for (const group of groups) {
    for (const entry of group.entries) {
      const entryPath = entry.file.path;

      for (const propertyId of propertiesToTrack) {
        const value = entry.getValue(propertyId);
        // Normalize value for consistent hashing
        let valueStr: string;

        if (value === null || value === undefined) {
          valueStr = "__null__";
        } else {
          valueStr = String(value);
        }

        parts.push(`${entryPath}:${propertyId}=${valueStr}`);
      }
    }
  }

  // Use a simple hash function for the combined string
  let hash = 0;
  const combined = parts.join("|");

  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }

  return hash.toString(36);
}

/**
 * Compute a render signature that uniquely identifies the current visual state.
 * This is used to determine if a full re-render is necessary.
 */
export function computeRenderSignature(
  groups: BasesEntryGroup[],
  displaySettings: DisplaySettings,
  localCardOrderByColumn: Map<string, string[]>,
  selectedProperties: BasesPropertyId[],
  groupByProperty: BasesPropertyId | null,
): string {
  const groupKeys = groups.map((g) => getColumnKey(g.key)).join("|");
  const entryPaths = groups
    .flatMap((g) => g.entries.map((e) => e.file.path))
    .join("|");
  const settingsHash = JSON.stringify(displaySettings);
  const localOrderHash = JSON.stringify([
    ...localCardOrderByColumn.entries(),
  ]);

  // Compute property values hash for visible properties
  // This ensures re-render when card properties (like tags) change
  const propertiesToTrack = selectedProperties.filter(
    (propertyId) =>
      propertyId !== "file.name" && propertyId !== groupByProperty,
  );

  const propertyValuesHash = computePropertyValuesHash(
    groups,
    propertiesToTrack,
  );

  const signature = `${groupKeys}::${entryPaths}::${settingsHash}::${localOrderHash}::${propertyValuesHash}`;

  return signature;
}

/**
 * Determine if full render can be skipped based on signature comparison.
 */
export function canSkipFullRender(
  currentSignature: string,
  lastRenderSignature: string | null,
  hasRenderedBoard: boolean,
): boolean {
  if (!hasRenderedBoard || lastRenderSignature === null) {
    return false;
  }

  return currentSignature === lastRenderSignature;
}

/**
 * Compute column snapshots for partial render detection.
 * Returns a map of column key to ordered array of entry paths.
 */
export function computeColumnSnapshots(
  renderedGroups: RenderedGroup[],
): ColumnSnapshot {
  const snapshots = new Map<string, string[]>();
  for (const { group, entries } of renderedGroups) {
    const columnKey = getColumnKey(group.key);
    snapshots.set(
      columnKey,
      entries.map((e) => e.file.path),
    );
  }
  return snapshots;
}

/**
 * Find columns that have changed between two snapshots.
 * Returns array of column keys that differ.
 */
export function findChangedColumns(
  previous: ColumnSnapshot,
  current: ColumnSnapshot,
): string[] {
  const changed: string[] = [];

  for (const [key, currentPaths] of current) {
    const previousPaths = previous.get(key);
    if (previousPaths === undefined) {
      // New column
      changed.push(key);
      continue;
    }
    if (currentPaths.length !== previousPaths.length) {
      changed.push(key);
      continue;
    }
    for (let i = 0; i < currentPaths.length; i++) {
      if (currentPaths[i] !== previousPaths[i]) {
        changed.push(key);
        break;
      }
    }
  }

  // Check for removed columns
  for (const key of previous.keys()) {
    if (!current.has(key)) {
      changed.push(key);
    }
  }

  return changed;
}

/**
 * Determine if partial rendering is possible and which columns changed.
 * Limits partial render to 5 changed columns max.
 */
export function canRenderPartially(
  renderedGroups: RenderedGroup[],
  lastColumnPathSnapshots: ColumnSnapshot,
  hasRenderedBoard: boolean,
): PartialRenderResult {
  if (!hasRenderedBoard || lastColumnPathSnapshots.size === 0) {
    return { canPartial: false, changedColumns: [] };
  }

  const currentSnapshots = computeColumnSnapshots(renderedGroups);
  const changedColumns = findChangedColumns(
    lastColumnPathSnapshots,
    currentSnapshots,
  );

  if (changedColumns.length === 0) {
    return { canPartial: false, changedColumns: [] };
  }

  // Check if board structure is unchanged
  const boardStructureChanged =
    currentSnapshots.size !== lastColumnPathSnapshots.size ||
    changedColumns.some((key) => !lastColumnPathSnapshots.has(key));

  if (boardStructureChanged) {
    return { canPartial: false, changedColumns: [] };
  }

  // Limit partial render to reasonable number of changed columns
  if (changedColumns.length > 5) {
    return { canPartial: false, changedColumns: [] };
  }

  return { canPartial: true, changedColumns };
}
