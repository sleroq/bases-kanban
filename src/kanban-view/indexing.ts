import { BasesEntry } from "obsidian";

export type EntryGroupLike = {
  entries: BasesEntry[];
};

export function buildEntryIndexes(groups: EntryGroupLike[]): {
  entryByPath: Map<string, BasesEntry>;
  cardOrder: string[];
} {
  const entryByPath = new Map<string, BasesEntry>();
  const cardOrder: string[] = [];

  for (const group of groups) {
    for (const entry of group.entries) {
      const path = entry.file.path;
      entryByPath.set(path, entry);
      cardOrder.push(path);
    }
  }

  return { entryByPath, cardOrder };
}

export type ElementIndexes = {
  cardElByPath: Map<string, HTMLElement>;
  columnElByKey: Map<string, HTMLElement>;
};

export function buildElementIndexesFromDOM(rootEl: HTMLElement): ElementIndexes {
  const cardElByPath = new Map<string, HTMLElement>();
  const columnElByKey = new Map<string, HTMLElement>();

  const columnEls = Array.from(
    rootEl.querySelectorAll<HTMLElement>(".bases-kanban-column"),
  );
  for (const columnEl of columnEls) {
    const columnKey = columnEl.dataset.columnKey;
    if (typeof columnKey === "string" && columnKey.length > 0) {
      columnElByKey.set(columnKey, columnEl);
    }
  }

  const cardEls = Array.from(
    rootEl.querySelectorAll<HTMLElement>(".bases-kanban-card"),
  );
  for (const cardEl of cardEls) {
    const path = cardEl.dataset.cardPath;
    if (typeof path === "string" && path.length > 0) {
      cardElByPath.set(path, cardEl);
    }
  }

  return { cardElByPath, columnElByKey };
}

export function clearCardIndexesForColumns(
  cardElByPath: Map<string, HTMLElement>,
  columnKeys: string[],
  columnElByKey: Map<string, HTMLElement>,
): void {
  for (const columnKey of columnKeys) {
    const columnEl = columnElByKey.get(columnKey);
    if (columnEl === undefined) {
      continue;
    }

    // Remove all card entries that belong to this column
    const cards = Array.from(
      columnEl.querySelectorAll<HTMLElement>(".bases-kanban-card"),
    );
    for (const cardEl of cards) {
      const path = cardEl.dataset.cardPath;
      if (typeof path === "string") {
        cardElByPath.delete(path);
      }
    }
  }
}

export function addCardIndexesFromColumn(
  cardElByPath: Map<string, HTMLElement>,
  columnEl: HTMLElement,
): void {
  const cards = Array.from(
    columnEl.querySelectorAll<HTMLElement>(".bases-kanban-card"),
  );
  for (const cardEl of cards) {
    const path = cardEl.dataset.cardPath;
    if (typeof path === "string" && path.length > 0) {
      cardElByPath.set(path, cardEl);
    }
  }
}

export type IndexReconciliationResult = {
  staleCardReferences: number;
  orphanedCards: number;
  missingColumns: string[];
  isConsistent: boolean;
};

export function reconcileCardElementIndexes(
  cardElByPath: Map<string, HTMLElement>,
  columnElByKey: Map<string, HTMLElement>,
  entryByPath: Map<string, BasesEntry>,
): IndexReconciliationResult {
  const result: IndexReconciliationResult = {
    staleCardReferences: 0,
    orphanedCards: 0,
    missingColumns: [],
    isConsistent: true,
  };

  // Find stale references (path in index but element not in DOM or wrong element)
  for (const [path, cardEl] of cardElByPath.entries()) {
    // Check if element is still connected to DOM
    if (!cardEl.isConnected) {
      cardElByPath.delete(path);
      result.staleCardReferences += 1;
      continue;
    }

    // Verify element still has the correct path
    if (cardEl.dataset.cardPath !== path) {
      cardElByPath.delete(path);
      result.staleCardReferences += 1;
    }
  }

  // Check for orphaned cards (cards in DOM but not in entry index)
  for (const columnEl of columnElByKey.values()) {
    const cards = Array.from(
      columnEl.querySelectorAll<HTMLElement>(".bases-kanban-card"),
    );
    for (const cardEl of cards) {
      const path = cardEl.dataset.cardPath;
      if (typeof path === "string" && !entryByPath.has(path)) {
        result.orphanedCards += 1;
      }
    }
  }

  // Check for missing columns
  for (const columnKey of columnElByKey.keys()) {
    const columnEl = columnElByKey.get(columnKey);
    if (columnEl === undefined || !columnEl.isConnected) {
      result.missingColumns.push(columnKey);
    }
  }

  result.isConsistent =
    result.staleCardReferences === 0 &&
    result.orphanedCards === 0 &&
    result.missingColumns.length === 0;

  return result;
}

export function validateIndexes(
  cardElByPath: Map<string, HTMLElement>,
  columnElByKey: Map<string, HTMLElement>,
  entryByPath: Map<string, BasesEntry>,
  context?: string,
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  let issues = 0;
  const prefix = context !== undefined ? `[${context}] ` : "";

  // Check for stale card references
  for (const [path, cardEl] of cardElByPath.entries()) {
    if (!cardEl.isConnected) {
      console.warn(`${prefix}Stale card reference: ${path} (element not in DOM)`);
      issues += 1;
    } else if (cardEl.dataset.cardPath !== path) {
      console.warn(
        `${prefix}Mismatched card path: index has "${path}", element has "${cardEl.dataset.cardPath}"`,
      );
      issues += 1;
    }
  }

  // Check for orphaned entries
  for (const path of entryByPath.keys()) {
    if (!cardElByPath.has(path)) {
      console.warn(`${prefix}Missing card element for entry: ${path}`);
      issues += 1;
    }
  }

  // Check for orphaned cards in DOM
  const domPaths = new Set<string>();
  for (const columnEl of columnElByKey.values()) {
    const cards = Array.from(
      columnEl.querySelectorAll<HTMLElement>(".bases-kanban-card"),
    );
    for (const cardEl of cards) {
      const path = cardEl.dataset.cardPath;
      if (typeof path === "string") {
        domPaths.add(path);
        if (!entryByPath.has(path)) {
          console.warn(`${prefix}Orphaned card in DOM: ${path} (no entry)`);
          issues += 1;
        }
        if (!cardElByPath.has(path)) {
          console.warn(`${prefix}Unindexed card in DOM: ${path}`);
          issues += 1;
        }
      }
    }
  }

  // Check for cards in index but not in DOM
  for (const path of cardElByPath.keys()) {
    if (!domPaths.has(path)) {
      console.warn(`${prefix}Card in index but not in DOM: ${path}`);
      issues += 1;
    }
  }

  if (issues > 0) {
    console.warn(`${prefix}Index validation found ${issues} issue(s)`);
  }
}
