import {
  App,
  BasesEntry,
  BasesEntryGroup,
  BasesPropertyId,
  BasesView,
  Menu,
  Modal,
  Notice,
  QueryController,
  TFile,
} from "obsidian";

import type BasesKanbanPlugin from "./main";
import {
  logDebug,
  logDragEvent,
  logRenderEvent,
  logScrollEvent,
} from "./kanban-view/debug";
import {
  BACKGROUND_BLUR_OPTION_KEY,
  BACKGROUND_BRIGHTNESS_OPTION_KEY,
  BACKGROUND_IMAGE_OPTION_KEY,
  BOARD_SCROLL_POSITION_KEY,
  BOARD_SCROLL_STATE_KEY,
  BOARD_SCROLL_TOP_POSITION_KEY,
  COLUMN_BLUR_OPTION_KEY,
  COLUMN_ORDER_OPTION_KEY,
  COLUMN_TRANSPARENCY_OPTION_KEY,
  LOCAL_CARD_ORDER_OPTION_KEY,
} from "./kanban-view/constants";
import { getKanbanViewOptions } from "./kanban-view/options";
import {
  detectGroupByProperty,
  getColumnKey,
  getPropertyCandidates,
  getSelectedProperties,
  getWritablePropertyKey,
  hasConfiguredGroupBy,
} from "./kanban-view/utils";
import { buildEntryIndexes } from "./kanban-view/indexing";
import { KanbanDragController } from "./kanban-view/drag-controller";
import { KanbanMutationService } from "./kanban-view/mutations";
import {
  KanbanRenderer,
  type KanbanRendererHandlers,
  type RenderContext,
} from "./kanban-view/renderer";
import {
  type ColumnOrderCache,
  type CardOrderCache,
  saveBoardScrollState,
  loadScrollState,
  loadLegacyScrollPosition,
  parseColumnOrder,
  serializeColumnOrder,
  parseLocalCardOrder,
  serializeLocalCardOrder,
  saveColumnScrollPosition,
  loadColumnScrollPosition,
} from "./kanban-view/state-persistence";
import {
  type BackgroundManagerState,
  applyBackground,
  createBackgroundManagerState,
} from "./kanban-view/background-manager";
import {
  type RenderedGroup,
  type PartialRenderResult,
  mergeGroupsByColumnKey,
  sortGroupsByColumnOrder,
  buildRenderedGroups,
  computeRenderSignature,
  canSkipFullRender,
  computeColumnSnapshots,
  canRenderPartially,
} from "./kanban-view/render-pipeline";
import {
  type SelectionState,
  createSelectionState,
  selectCard as selectCardState,
  clearSelection as clearSelectionState,
  getDraggedPaths as getDraggedPathsState,
  syncSelectionWithEntries,
  isPathSelected,
  hasSelection,
} from "./kanban-view/selection-state";

export class KanbanView extends BasesView {
  type = "kanban";
  private readonly rootEl: HTMLElement;
  private readonly dragController: KanbanDragController;
  private readonly mutationService: KanbanMutationService;
  private readonly renderer: KanbanRenderer;
  private readonly plugin: BasesKanbanPlugin;
  private selectionState: SelectionState;
  private cardOrder: string[] = [];
  private entryByPath = new Map<string, BasesEntry>();
  private scrollSaveTimeout: number | null = null;
  private backgroundManagerState: BackgroundManagerState;
  private cardElByPath = new Map<string, HTMLElement>();
  private columnElByKey = new Map<string, HTMLElement>();
  private viewSessionId: string;
  private scrollRevision = 0;
  private pendingLocalScrollRevision: number | null = null;
  private hasRenderedBoard = false;
  private lastPersistedScrollState: { left: number; top: number } | null = null;
  private lastRenderSignature: string | null = null;
  private localCardOrderCache: CardOrderCache = { order: null, raw: "" };
  private columnOrderCache: ColumnOrderCache = { order: null, raw: "" };
  private lastColumnPathSnapshots = new Map<string, string[]>();

  constructor(
    controller: QueryController,
    containerEl: HTMLElement,
    plugin: BasesKanbanPlugin,
  ) {
    super(controller);
    this.plugin = plugin;
    this.viewSessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.backgroundManagerState = createBackgroundManagerState();
    this.selectionState = createSelectionState();
    this.rootEl = containerEl.createDiv({ cls: "bases-kanban-container" });
    this.dragController = new KanbanDragController(this.rootEl);
    this.mutationService = new KanbanMutationService(this.app as App);
    const handlers: KanbanRendererHandlers = {
      onStartColumnDrag: (evt, columnKey) => {
        this.startColumnDrag(evt, columnKey);
      },
      onEndColumnDrag: () => {
        this.endColumnDrag();
      },
      onSetColumnDropIndicator: (columnKey, placement) => {
        this.setColumnDropIndicator(columnKey, placement);
      },
      onClearColumnDropIndicator: () => {
        this.clearColumnDropIndicator();
      },
      onHandleColumnDrop: (columnKey, placement) => {
        this.handleColumnDrop(columnKey, placement);
      },
      onCreateCardForColumn: async (groupByProperty, groupKey) => {
        await this.createCardForColumn(groupByProperty, groupKey);
      },
      onSetupCardDragBehavior: (cardEl) => {
        this.setupCardDragBehavior(cardEl);
      },
      onSelectCard: (filePath, extendSelection) => {
        this.selectCard(filePath, extendSelection);
      },
      onGetCardIndex: (filePath) => {
        return this.getCardIndex(filePath);
      },
      onClearSelection: () => {
        this.clearSelection();
      },
      onStartCardDrag: (evt, filePath, cardIndex) => {
        this.startDrag(evt, filePath, cardIndex);
      },
      onEndCardDrag: () => {
        this.endDrag();
      },
      onSetCardDropIndicator: (targetPath, placement) => {
        this.setCardDropIndicator(targetPath, placement);
      },
      onClearCardDropIndicator: () => {
        this.clearCardDropIndicator();
      },
      onHandleDrop: async (
        groupByProperty,
        groupKey,
        targetPath,
        placement,
      ) => {
        await this.handleDrop(groupByProperty, groupKey, targetPath, placement);
      },
      onShowCardContextMenu: (evt, file) => {
        this.showCardContextMenu(evt, file);
      },
      onKeyDown: (evt) => {
        this.handleKeyDown(evt);
      },
      onColumnScroll: (columnKey, scrollTop) => {
        this.handleColumnScroll(columnKey, scrollTop);
      },
    };
    this.renderer = new KanbanRenderer(this.app as App, handlers);
  }

  onDataUpdated(): void {
    if (this.shouldSkipRenderForOwnScrollUpdate()) {
      logRenderEvent("SKIPPED render - own scroll update detected");
      return;
    }
    this.render();
  }

  private shouldSkipRenderForOwnScrollUpdate(): boolean {
    if (this.pendingLocalScrollRevision === null) {
      return false;
    }

    const scrollState = loadScrollState(
      (key) => this.config?.get(key),
      BOARD_SCROLL_STATE_KEY,
    );
    if (
      scrollState !== null &&
      scrollState.sessionId === this.viewSessionId &&
      scrollState.revision === this.pendingLocalScrollRevision
    ) {
      logScrollEvent("Confirmed own scroll revision match", {
        revision: this.pendingLocalScrollRevision,
        sessionId: this.viewSessionId.slice(0, 8) + "...",
      });
      this.pendingLocalScrollRevision = null;
      return true;
    }

    return false;
  }

  private renderPartial(
    renderedGroups: RenderedGroup[],
    changedColumnKeys: string[],
    context: RenderContext,
  ): void {
    logRenderEvent("PARTIAL RENDER - replacing columns", {
      changedCount: changedColumnKeys.length,
      changedKeys: changedColumnKeys.join(","),
    });

    const boardEl = this.rootEl.querySelector<HTMLElement>(
      ".bases-kanban-board",
    );
    if (boardEl === null) {
      logRenderEvent(
        "PARTIAL RENDER - board not found, falling back to full render",
      );
      return;
    }

    // Build a map of rendered groups by key for quick lookup
    const groupByKey = new Map(
      renderedGroups.map((rg) => [getColumnKey(rg.group.key), rg]),
    );

    // Calculate starting card index for each column
    let cardIndex = 0;
    const columnCardIndexes = new Map<string, number>();
    for (const { group } of renderedGroups) {
      const key = getColumnKey(group.key);
      columnCardIndexes.set(key, cardIndex);
      const rg = groupByKey.get(key);
      if (rg !== undefined) {
        cardIndex += rg.entries.length;
      }
    }

    // Replace only changed columns
    for (const columnKey of changedColumnKeys) {
      const existingColumn = this.columnElByKey.get(columnKey);
      const renderedGroup = groupByKey.get(columnKey);

      if (
        renderedGroup === undefined ||
        existingColumn === undefined ||
        existingColumn === null
      ) {
        logRenderEvent("PARTIAL RENDER - column not found, skipping", {
          columnKey,
        });
        continue;
      }

      // Create new column with updated content
      const startIndex = columnCardIndexes.get(columnKey) ?? 0;
      const newColumnEl = this.renderer.renderColumnDetached(
        columnKey,
        renderedGroup.group.key,
        renderedGroup.entries,
        startIndex,
        context,
      );

      // Replace in DOM
      existingColumn.replaceWith(newColumnEl);

      // Update element index
      this.columnElByKey.set(columnKey, newColumnEl);

      // Update card indexes
      const cards =
        newColumnEl.querySelectorAll<HTMLElement>(".bases-kanban-card");
      for (let i = 0; i < cards.length; i++) {
        const cardEl = cards[i];
        const path = cardEl.dataset.cardPath;
        if (typeof path === "string" && path.length > 0) {
          this.cardElByPath.set(path, cardEl);
        }
      }

      // Restore scroll position for this column if we tracked it
      this.restoreColumnScrollPosition(columnKey, newColumnEl);
    }

    // Update global state
    this.refreshEntryIndexesFromRendered(renderedGroups);
    this.lastColumnPathSnapshots = computeColumnSnapshots(renderedGroups);

    logRenderEvent("PARTIAL RENDER COMPLETE", {
      replacedColumns: changedColumnKeys.length,
    });
  }

  private restoreColumnScrollPosition(
    columnKey: string,
    columnEl: HTMLElement,
  ): void {
    const scrollTop = loadColumnScrollPosition(this.viewSessionId, columnKey);
    if (scrollTop <= 0) {
      return;
    }

    // Defer scroll restoration to next animation frame when layout is computed
    window.requestAnimationFrame(() => {
      const cardsEl = columnEl.querySelector<HTMLElement>(
        ".bases-kanban-cards",
      );
      if (cardsEl !== null) {
        cardsEl.scrollTop = scrollTop;
        logScrollEvent("Column scroll restored", { columnKey, scrollTop });
      }
    });
  }

  private updateCheapUI(): void {
    this.applyBackgroundStyles();
    this.updateSelectionStyles();
  }

  private render(): void {
    logRenderEvent("render() called");

    const rawGroups: BasesEntryGroup[] = this.data?.groupedData ?? [];
    const groups = mergeGroupsByColumnKey(rawGroups);

    logRenderEvent("Data prepared", {
      rawGroupCount: rawGroups.length,
      mergedGroupCount: groups.length,
      totalEntries: groups.reduce((sum, g) => sum + g.entries.length, 0),
    });

    const displaySettings = {
      cardTitleSource: this.plugin.settings.cardTitleSource,
      cardTitleMaxLength: this.plugin.settings.cardTitleMaxLength,
      propertyValueSeparator: this.plugin.settings.propertyValueSeparator,
      tagPropertySuffix: this.plugin.settings.tagPropertySuffix,
      tagSaturation: this.plugin.settings.tagSaturation,
      tagLightness: this.plugin.settings.tagLightness,
      tagAlpha: this.plugin.settings.tagAlpha,
    };

    const localCardOrderByColumn = this.getLocalCardOrderByColumn();

    // Compute these early for signature comparison
    const selectedProperties = getSelectedProperties(this.data?.properties);
    const groupByProperty = detectGroupByProperty(
      rawGroups,
      getPropertyCandidates(selectedProperties, this.allProperties),
    );

    const currentSignature = computeRenderSignature(
      groups,
      displaySettings,
      localCardOrderByColumn,
      selectedProperties,
      groupByProperty,
    );

    if (canSkipFullRender(currentSignature, this.lastRenderSignature, this.hasRenderedBoard)) {
      logRenderEvent(
        "SKIPPED - full render not needed, updating cheap UI only",
      );
      this.updateCheapUI();
      return;
    }

    if (!hasConfiguredGroupBy(groups)) {
      logRenderEvent("Proceeding with FULL DOM RENDER (no group by)");
      this.rootEl.empty();
      this.applyBackgroundStyles();
      this.refreshEntryIndexes(groups);
      this.clearElementIndexes();
      this.renderPlaceholder();
      return;
    }

    const columnOrder = this.getColumnOrderFromConfig();
    const orderedGroups = sortGroupsByColumnOrder(groups, columnOrder);
    const renderedGroups = buildRenderedGroups(orderedGroups, localCardOrderByColumn);

    // Try partial render first (for cross-column moves or single-card adds)
    const { canPartial, changedColumns }: PartialRenderResult = canRenderPartially(
      renderedGroups,
      this.lastColumnPathSnapshots,
      this.hasRenderedBoard,
    );

    if (canPartial && changedColumns.length > 0) {
      const context: RenderContext = {
        selectedProperties,
        groupByProperty,
        selectedPaths: this.selectionState.selectedPaths,
        getDraggingColumnKey: () =>
          this.dragController.getColumnDragSourceKey(),
        getDraggingSourcePath: () =>
          this.dragController.getCardDragSourcePath(),
        getColumnDropPlacement: () =>
          this.dragController.getColumnDropPlacement(),
        getCardDropPlacement: () => this.dragController.getCardDropPlacement(),
        getCardDropTargetPath: () =>
          this.dragController.getCardDropTargetPath(),
        emptyColumnLabel: this.plugin.settings.emptyColumnLabel,
        addCardButtonText: this.plugin.settings.addCardButtonText,
        cardTitleSource: this.plugin.settings.cardTitleSource,
        cardTitleMaxLength: this.plugin.settings.cardTitleMaxLength,
        propertyValueSeparator: this.plugin.settings.propertyValueSeparator,
        tagPropertySuffix: this.plugin.settings.tagPropertySuffix,
        tagSaturation: this.plugin.settings.tagSaturation,
        tagLightness: this.plugin.settings.tagLightness,
        tagAlpha: this.plugin.settings.tagAlpha,
        columnHeaderWidth: this.plugin.settings.columnHeaderWidth,
      };

      this.renderPartial(renderedGroups, changedColumns, context);

      // Update signature and snapshots for next render
      this.lastRenderSignature = computeRenderSignature(
        groups,
        displaySettings,
        localCardOrderByColumn,
        selectedProperties,
        groupByProperty,
      );

      return;
    }

    logRenderEvent("Proceeding with FULL DOM RENDER", {
      groupCount: groups.length,
      hasConfiguredGroupBy: hasConfiguredGroupBy(groups),
    });

    const previousBoardScrollLeft = this.getBoardScrollLeft();
    this.rootEl.empty();
    this.applyBackgroundStyles();

    this.refreshEntryIndexesFromRendered(renderedGroups);

    const boardEl = this.rootEl.createDiv({ cls: "bases-kanban-board" });
    this.setupBoardScrollListener(boardEl);
    const context: RenderContext = {
      selectedProperties,
      groupByProperty,
      selectedPaths: this.selectionState.selectedPaths,
      getDraggingColumnKey: () => this.dragController.getColumnDragSourceKey(),
      getDraggingSourcePath: () => this.dragController.getCardDragSourcePath(),
      getColumnDropPlacement: () =>
        this.dragController.getColumnDropPlacement(),
      getCardDropPlacement: () => this.dragController.getCardDropPlacement(),
      getCardDropTargetPath: () => this.dragController.getCardDropTargetPath(),
      emptyColumnLabel: this.plugin.settings.emptyColumnLabel,
      addCardButtonText: this.plugin.settings.addCardButtonText,
      cardTitleSource: this.plugin.settings.cardTitleSource,
      cardTitleMaxLength: this.plugin.settings.cardTitleMaxLength,
      propertyValueSeparator: this.plugin.settings.propertyValueSeparator,
      tagPropertySuffix: this.plugin.settings.tagPropertySuffix,
      tagSaturation: this.plugin.settings.tagSaturation,
      tagLightness: this.plugin.settings.tagLightness,
      tagAlpha: this.plugin.settings.tagAlpha,
      columnHeaderWidth: this.plugin.settings.columnHeaderWidth,
    };

    let cardIndex = 0;
    for (const renderedGroup of renderedGroups) {
      cardIndex = this.renderer.renderColumn(
        boardEl,
        getColumnKey(renderedGroup.group.key),
        renderedGroup.group.key,
        renderedGroup.entries,
        cardIndex,
        context,
      );
    }

    this.refreshElementIndexes();

    logRenderEvent("DOM built, element indexes refreshed", {
      columnCount: this.columnElByKey.size,
      cardCount: this.cardElByPath.size,
    });

    // Restore column scroll positions for full render
    for (const { group } of renderedGroups) {
      const columnKey = getColumnKey(group.key);
      const columnEl = this.columnElByKey.get(columnKey);
      if (columnEl !== undefined) {
        this.restoreColumnScrollPosition(columnKey, columnEl);
      }
    }

    // Load saved scroll position to restore vertical scroll
    const savedScroll = this.loadBoardScrollPosition();

    // Use current horizontal scroll if re-rendering, otherwise use saved
    const finalScrollLeft = this.hasRenderedBoard
      ? previousBoardScrollLeft
      : savedScroll.scrollLeft;

    // Always restore vertical scroll from saved state
    this.restoreBoardScrollPosition(finalScrollLeft, savedScroll.scrollTop);
    this.hasRenderedBoard = true;
    this.lastRenderSignature = computeRenderSignature(
      groups,
      displaySettings,
      localCardOrderByColumn,
      selectedProperties,
      groupByProperty,
    );
    this.lastColumnPathSnapshots = computeColumnSnapshots(renderedGroups);
    const scrollRestored = !this.hasRenderedBoard;
    this.hasRenderedBoard = true;

    logRenderEvent("FULL RENDER COMPLETE", {
      scrollRestored,
      finalScrollLeft,
    });
  }

  private getBoardScrollLeft(): number {
    const boardEl = this.rootEl.querySelector<HTMLElement>(
      ".bases-kanban-board",
    );
    if (boardEl === null) {
      return 0;
    }

    return boardEl.scrollLeft;
  }

  private restoreBoardScrollPosition(
    scrollLeft: number,
    scrollTop: number,
  ): void {
    const boardEl = this.rootEl.querySelector<HTMLElement>(
      ".bases-kanban-board",
    );
    if (boardEl === null) {
      return;
    }

    // Defer scroll restoration to next animation frame when layout is computed
    window.requestAnimationFrame(() => {
      if (!this.rootEl.contains(boardEl)) {
        return;
      }
      if (scrollLeft > 0) {
        boardEl.scrollLeft = scrollLeft;
      }
      if (scrollTop > 0) {
        boardEl.scrollTop = scrollTop;
      }
      logScrollEvent("Board scroll restored", { scrollLeft, scrollTop });
    });
  }

  private setupBoardScrollListener(boardEl: HTMLElement): void {
    boardEl.addEventListener("scroll", (evt) => {
      const target = evt.target as HTMLElement;
      this.debouncedSaveBoardScrollPosition(
        target.scrollLeft,
        target.scrollTop,
      );
    });
  }

  private debouncedSaveBoardScrollPosition(
    scrollLeft: number,
    scrollTop: number,
  ): void {
    logScrollEvent("Debounced scroll save triggered", {
      scrollLeft,
      scrollTop,
    });
    if (this.scrollSaveTimeout !== null) {
      window.clearTimeout(this.scrollSaveTimeout);
    }
    this.scrollSaveTimeout = window.setTimeout(() => {
      logScrollEvent("Executing debounced scroll save");
      if (
        this.lastPersistedScrollState !== null &&
        this.lastPersistedScrollState.left === scrollLeft &&
        this.lastPersistedScrollState.top === scrollTop
      ) {
        logScrollEvent("Scroll save skipped - no change", {
          scrollLeft,
          scrollTop,
        });
        return;
      }

      this.scrollRevision = saveBoardScrollState(
        (key, value) => this.config?.set(key, value),
        BOARD_SCROLL_STATE_KEY,
        scrollLeft,
        scrollTop,
        this.viewSessionId,
        this.scrollRevision,
      );
      this.pendingLocalScrollRevision = this.scrollRevision;
      this.lastPersistedScrollState = { left: scrollLeft, top: scrollTop };
      this.scrollSaveTimeout = null;
    }, this.plugin.settings.scrollDebounceMs);
  }

  private loadBoardScrollPosition(): { scrollLeft: number; scrollTop: number } {
    const scrollState = loadScrollState(
      (key) => this.config?.get(key),
      BOARD_SCROLL_STATE_KEY,
    );
    if (scrollState !== null) {
      return {
        scrollLeft: scrollState.left,
        scrollTop: scrollState.top,
      };
    }

    return loadLegacyScrollPosition(
      (key) => this.config?.get(key),
      BOARD_SCROLL_POSITION_KEY,
      BOARD_SCROLL_TOP_POSITION_KEY,
    );
  }

  private renderPlaceholder(): void {
    this.applyBackgroundStyles();
    this.rootEl.createEl("p", {
      text: this.plugin.settings.placeholderText,
      cls: "bases-kanban-placeholder",
    });
  }

  private applyBackgroundStyles(): void {
    const app = this.app as App;
    const config = {
      imageInput: this.config?.get(BACKGROUND_IMAGE_OPTION_KEY),
      brightness:
        (this.config?.get(BACKGROUND_BRIGHTNESS_OPTION_KEY) as number | undefined) ??
        this.plugin.settings.backgroundBrightness,
      blur:
        (this.config?.get(BACKGROUND_BLUR_OPTION_KEY) as number | undefined) ??
        this.plugin.settings.backgroundBlur,
      columnTransparency:
        (this.config?.get(COLUMN_TRANSPARENCY_OPTION_KEY) as number | undefined) ??
        this.plugin.settings.columnTransparency,
      columnBlur:
        (this.config?.get(COLUMN_BLUR_OPTION_KEY) as number | undefined) ??
        this.plugin.settings.columnBlur,
    };

    applyBackground(app, this.rootEl, this.backgroundManagerState, config);
  }

  private setupCardDragBehavior(cardEl: HTMLElement): void {
    cardEl.addEventListener("mousedown", (evt) => {
      cardEl.draggable = evt.button === 0;
    });
    cardEl.addEventListener("mouseup", () => {
      if (this.dragController.getCardDragSourcePath() === null) {
        cardEl.draggable = false;
      }
    });
    cardEl.addEventListener("contextmenu", () => {
      if (this.dragController.getCardDragSourcePath() === null) {
        cardEl.draggable = false;
      }
    });
    cardEl.addEventListener("dragend", () => {
      cardEl.draggable = false;
    });
  }

  private showCardContextMenu(evt: MouseEvent, file: TFile): void {
    evt.preventDefault();
    evt.stopPropagation();
    evt.stopImmediatePropagation();
    const menu = new Menu();

    // Add custom trash option at the top
    menu.addItem((item) => {
      item
        .setTitle(this.plugin.settings.trashMenuText)
        .setIcon("trash")
        .onClick(() => void this.trashFiles([file]));
    });

    menu.addSeparator();

    this.app.workspace.trigger("file-menu", menu, file, "kanban-view");
    menu.showAtMouseEvent(evt);
  }

  private async trashFiles(files: TFile[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    // Show confirmation for multiple files
    if (files.length > 1) {
      const confirmed = await new Promise<boolean>((resolve) => {
        const modal = new Modal(this.app as App);
        modal.titleEl.setText(`Move ${files.length} files to trash?`);
        modal.contentEl.createEl("p", {
          text: `This will move ${files.length} files to the trash. This action can be undone from the system trash.`,
        });

        const buttonContainer = modal.contentEl.createDiv({
          cls: "modal-button-container",
        });

        const cancelButton = buttonContainer.createEl("button", {
          text: this.plugin.settings.cancelButtonText,
          cls: "mod-secondary",
        });
        cancelButton.addEventListener("click", () => {
          resolve(false);
          modal.close();
        });

        const confirmButton = buttonContainer.createEl("button", {
          text: this.plugin.settings.trashConfirmButtonText,
          cls: "mod-cta",
        });
        confirmButton.style.backgroundColor =
          "var(--background-modifier-error)";
        confirmButton.style.color = "var(--text-on-accent)";
        confirmButton.addEventListener("click", () => {
          resolve(true);
          modal.close();
        });

        modal.open();
      });

      if (!confirmed) {
        return;
      }
    }

    // Trash files - try system trash first, fall back to local trash
    const trashedFiles: string[] = [];
    const failedFiles: string[] = [];

    const promises = files.map(async (file) => {
      try {
        await this.app.vault.trash(file, true);
        trashedFiles.push(file.path);
      } catch (error) {
        console.error(`Failed to trash ${file.path}:`, error);
        failedFiles.push(file.path);
      }
    });

    await Promise.all(promises);

    // Show notice if some files failed
    if (failedFiles.length > 0) {
      const noticeText = this.plugin.settings.failedTrashNoticeText.replace(
        "{count}",
        String(failedFiles.length),
      );
      new Notice(noticeText);
    }

    this.clearSelection();
  }

  private handleKeyDown(evt: KeyboardEvent): void {
    // Cmd/Ctrl + configured shortcut key to trash selected files
    const shortcutKey = this.plugin.settings.trashShortcutKey;
    if ((evt.metaKey || evt.ctrlKey) && evt.key === shortcutKey) {
      if (!hasSelection(this.selectionState)) {
        return;
      }

      evt.preventDefault();
      evt.stopPropagation();

      // Get TFile objects from selected paths
      const filesToTrash: TFile[] = [];
      for (const path of this.selectionState.selectedPaths) {
        const entry = this.entryByPath.get(path);
        if (entry?.file) {
          filesToTrash.push(entry.file);
        }
      }

      if (filesToTrash.length > 0) {
        void this.trashFiles(filesToTrash);
      }
    }
  }

  private async createCardForColumn(
    groupByProperty: BasesPropertyId | null,
    groupKey: unknown,
  ): Promise<void> {
    const groupByPropertyKey =
      groupByProperty === null ? null : getWritablePropertyKey(groupByProperty);

    await this.mutationService.createCardForColumn({
      groupByProperty,
      groupByPropertyKey,
      groupKey,
      createFileForView: async (filePath, updateFrontmatter) => {
        await this.createFileForView(filePath, updateFrontmatter);
      },
    });
  }

  private getLocalCardOrderByColumn(): Map<string, string[]> {
    const configValue = this.config?.get(LOCAL_CARD_ORDER_OPTION_KEY);
    const { order, cache } = parseLocalCardOrder(
      configValue,
      this.localCardOrderCache,
    );
    this.localCardOrderCache = cache;
    return order;
  }

  private setLocalCardOrderByColumn(
    orderByColumn: Map<string, string[]>,
  ): void {
    this.localCardOrderCache = { order: null, raw: "" };
    this.config?.set(
      LOCAL_CARD_ORDER_OPTION_KEY,
      serializeLocalCardOrder(orderByColumn),
    );
  }

  private updateLocalCardOrderForDrop(
    sourceColumnKey: string | null,
    targetColumnKey: string,
    draggedPaths: string[],
    targetPath: string | null,
    placement: "before" | "after",
  ): void {
    if (draggedPaths.length === 0) {
      logDebug("CARD_ORDER", "updateLocalCardOrderForDrop - no dragged paths");
      return;
    }

    const uniqueDraggedPaths: string[] = [];
    const movedSet = new Set<string>();
    for (const path of draggedPaths) {
      if (movedSet.has(path)) {
        continue;
      }

      movedSet.add(path);
      uniqueDraggedPaths.push(path);
    }

    logDebug("CARD_ORDER", "Updating local card order for drop", {
      sourceColumnKey: sourceColumnKey ?? "null",
      targetColumnKey,
      draggedCount: uniqueDraggedPaths.length,
      targetPath: targetPath ?? "null",
      placement,
    });

    const localOrderByColumn = this.getLocalCardOrderByColumn();
    if (sourceColumnKey === null || sourceColumnKey === targetColumnKey) {
      const currentPaths = this.getColumnCardPaths(targetColumnKey);
      const reorderedPaths = this.reorderPathsForDrop(
        currentPaths,
        uniqueDraggedPaths,
        targetPath,
        placement,
      );
      logDebug("CARD_ORDER", "Same-column reorder", {
        columnKey: targetColumnKey,
        beforeCount: currentPaths.length,
        afterCount: reorderedPaths.length,
      });
      localOrderByColumn.set(targetColumnKey, reorderedPaths);
      this.setLocalCardOrderByColumn(localOrderByColumn);
      return;
    }

    const sourcePaths = this.getColumnCardPaths(sourceColumnKey).filter(
      (path) => !movedSet.has(path),
    );
    const targetPaths = this.getColumnCardPaths(targetColumnKey).filter(
      (path) => !movedSet.has(path),
    );
    const reorderedTargetPaths = this.reorderPathsForDrop(
      targetPaths,
      uniqueDraggedPaths,
      targetPath,
      placement,
    );

    logDebug("CARD_ORDER", "Cross-column reorder", {
      sourceColumnKey,
      targetColumnKey,
      sourceRemainingCount: sourcePaths.length,
      targetNewCount: reorderedTargetPaths.length,
    });

    localOrderByColumn.set(sourceColumnKey, sourcePaths);
    localOrderByColumn.set(targetColumnKey, reorderedTargetPaths);
    this.setLocalCardOrderByColumn(localOrderByColumn);
  }

  private reorderPathsForDrop(
    existingPaths: string[],
    movedPaths: string[],
    targetPath: string | null,
    placement: "before" | "after",
  ): string[] {
    const movedSet = new Set(movedPaths);
    if (targetPath !== null && movedSet.has(targetPath)) {
      return existingPaths;
    }

    const nextPaths = existingPaths.filter((path) => !movedSet.has(path));
    let insertionIndex = nextPaths.length;

    if (targetPath !== null) {
      const targetIndex = nextPaths.indexOf(targetPath);
      if (targetIndex !== -1) {
        insertionIndex = placement === "before" ? targetIndex : targetIndex + 1;
      }
    }

    nextPaths.splice(insertionIndex, 0, ...movedPaths);
    return nextPaths;
  }

  private refreshEntryIndexes(groups: BasesEntryGroup[]): void {
    const indexes = buildEntryIndexes(groups);
    this.entryByPath = indexes.entryByPath;
    this.cardOrder = indexes.cardOrder;
    this.selectionState = syncSelectionWithEntries(
      this.selectionState,
      new Set(this.entryByPath.keys()),
    );
  }

  private refreshEntryIndexesFromRendered(
    renderedGroups: Array<{ group: BasesEntryGroup; entries: BasesEntry[] }>,
  ): void {
    const indexes = buildEntryIndexes(renderedGroups);
    this.entryByPath = indexes.entryByPath;
    this.cardOrder = indexes.cardOrder;
    this.selectionState = syncSelectionWithEntries(
      this.selectionState,
      new Set(this.entryByPath.keys()),
    );
  }

  private getCardIndex(filePath: string): number {
    const index = this.cardOrder.indexOf(filePath);
    return index === -1 ? 0 : index;
  }

  private selectCard(filePath: string, extendSelection: boolean): void {
    const cardIndex = this.getCardIndex(filePath);

    this.selectionState = selectCardState(
      this.selectionState,
      filePath,
      cardIndex,
      extendSelection,
      () => this.cardOrder,
    );

    this.updateSelectionStyles();
  }

  private clearSelection(): void {
    if (!hasSelection(this.selectionState)) {
      return;
    }

    this.selectionState = clearSelectionState();
    this.updateSelectionStyles();
  }

  private updateSelectionStyles(): void {
    const cardEls =
      this.rootEl.querySelectorAll<HTMLElement>(".bases-kanban-card");

    cardEls.forEach((cardEl) => {
      const path = cardEl.dataset.cardPath;
      cardEl.toggleClass(
        "bases-kanban-card-selected",
        path !== undefined && isPathSelected(this.selectionState, path),
      );
    });
  }

  private startDrag(evt: DragEvent, filePath: string, cardIndex: number): void {
    const draggedPaths = getDraggedPathsState(
      this.selectionState,
      filePath,
      this.cardOrder,
    );
    logDragEvent("Card drag started", {
      sourcePath: filePath,
      cardIndex,
      selectedCount: this.selectionState.selectedPaths.size,
      draggingCount: draggedPaths.length,
    });

    if (!isPathSelected(this.selectionState, filePath)) {
      this.selectionState = {
        selectedPaths: new Set([filePath]),
        lastSelectedIndex: cardIndex,
      };
      this.updateSelectionStyles();
    }

    this.dragController.startCardDrag(evt, filePath);

    for (const path of draggedPaths) {
      const cardEl = this.getCardEl(path);
      cardEl?.addClass("bases-kanban-card-dragging");
    }
  }

  private endDrag(): void {
    logDragEvent("Card drag ended");
    this.dragController.endCardDrag();
  }

  private setCardDropIndicator(
    targetPath: string,
    placement: "before" | "after",
  ): void {
    this.dragController.setCardDropIndicator(targetPath, placement, (path) =>
      this.getCardEl(path),
    );
  }

  private clearCardDropIndicator(): void {
    this.dragController.clearCardDropIndicator();
  }

  private startColumnDrag(evt: DragEvent, columnKey: string): void {
    logDragEvent("Column drag started", { columnKey });
    this.dragController.startColumnDrag(evt, columnKey);
  }

  private endColumnDrag(): void {
    logDragEvent("Column drag ended");
    this.dragController.endColumnDrag();
  }

  private setColumnDropIndicator(
    columnKey: string,
    placement: "before" | "after",
  ): void {
    this.dragController.setColumnDropIndicator(columnKey, placement, (key) =>
      this.getColumnEl(key),
    );
  }

  private clearColumnDropIndicator(): void {
    this.dragController.clearColumnDropIndicator();
  }

  private getColumnEl(columnKey: string): HTMLElement | null {
    return this.columnElByKey.get(columnKey) ?? null;
  }

  private handleColumnDrop(
    targetColumnKey: string,
    placement: "before" | "after",
  ): void {
    const sourceColumnKey = this.dragController.getColumnDragSourceKey();
    logDragEvent("Column dropped", {
      sourceColumnKey: sourceColumnKey ?? "null",
      targetColumnKey,
      placement,
    });

    this.endColumnDrag();
    if (sourceColumnKey === null || sourceColumnKey === targetColumnKey) {
      logDragEvent("Column drop aborted - same column or no source");
      return;
    }

    const columnOrder = this.getColumnOrderFromConfig();
    const groups = mergeGroupsByColumnKey(this.data?.groupedData ?? []);
    const orderedGroups = sortGroupsByColumnOrder(groups, columnOrder);
    const orderedKeys = orderedGroups.map((g) => getColumnKey(g.key));
    const sourceIndex = orderedKeys.indexOf(sourceColumnKey);
    const targetIndex = orderedKeys.indexOf(targetColumnKey);
    if (sourceIndex === -1 || targetIndex === -1) {
      logDragEvent("Column drop aborted - index not found", {
        sourceIndex,
        targetIndex,
      });
      return;
    }

    const [moved] = orderedKeys.splice(sourceIndex, 1);
    let insertionIndex = placement === "before" ? targetIndex : targetIndex + 1;
    if (sourceIndex < insertionIndex) {
      insertionIndex -= 1;
    }
    orderedKeys.splice(insertionIndex, 0, moved);
    logDragEvent("Column order updated", {
      sourceIndex,
      targetIndex,
      insertionIndex,
      newOrder: orderedKeys,
    });
    this.updateColumnOrder(orderedKeys);
    // this.render(); commented out for debugging rendering
  }

  private handleColumnScroll(columnKey: string, scrollTop: number): void {
    // Save column scroll position for partial render restoration
    saveColumnScrollPosition(this.viewSessionId, columnKey, scrollTop);
  }

  private getColumnOrderFromConfig(): string[] {
    const configValue = this.config?.get(COLUMN_ORDER_OPTION_KEY);
    const { order, cache } = parseColumnOrder(
      configValue,
      this.columnOrderCache,
    );
    this.columnOrderCache = cache;
    return order;
  }

  private updateColumnOrder(columnOrder: string[]): void {
    this.columnOrderCache = { order: null, raw: "" };
    this.config?.set(COLUMN_ORDER_OPTION_KEY, serializeColumnOrder(columnOrder));
  }

  private getDraggedPaths(sourcePath: string): string[] {
    return getDraggedPathsState(this.selectionState, sourcePath, this.cardOrder);
  }

  private getCardEl(path: string): HTMLElement | null {
    return this.cardElByPath.get(path) ?? null;
  }

  private clearElementIndexes(): void {
    this.cardElByPath.clear();
    this.columnElByKey.clear();
  }

  private refreshElementIndexes(): void {
    this.clearElementIndexes();

    const columnEls = this.rootEl.querySelectorAll<HTMLElement>(
      ".bases-kanban-column",
    );
    columnEls.forEach((columnEl) => {
      const columnKey = columnEl.dataset.columnKey;
      if (typeof columnKey === "string" && columnKey.length > 0) {
        this.columnElByKey.set(columnKey, columnEl);
      }
    });

    const cardEls =
      this.rootEl.querySelectorAll<HTMLElement>(".bases-kanban-card");
    cardEls.forEach((cardEl) => {
      const path = cardEl.dataset.cardPath;
      if (typeof path === "string" && path.length > 0) {
        this.cardElByPath.set(path, cardEl);
      }
    });
  }

  private async handleDrop(
    groupByProperty: BasesPropertyId | null,
    groupKey: unknown,
    targetPath: string | null,
    placement: "before" | "after",
  ): Promise<void> {
    const draggingSourcePath = this.dragController.getCardDragSourcePath();
    if (groupByProperty === null || draggingSourcePath === null) {
      logDragEvent("Drop aborted - missing property or source", {
        hasGroupByProperty: groupByProperty !== null,
        hasDraggingSource: draggingSourcePath !== null,
      });
      return;
    }

    const draggedPaths = this.getDraggedPaths(draggingSourcePath);
    const sourceEntry = this.entryByPath.get(draggingSourcePath);
    const sourceColumnKey =
      sourceEntry === undefined
        ? null
        : getColumnKey(sourceEntry.getValue(groupByProperty));
    const targetColumnKey = getColumnKey(groupKey);

    logDragEvent("Card dropped", {
      sourceColumnKey: sourceColumnKey ?? "null",
      targetColumnKey,
      draggedCount: draggedPaths.length,
      targetPath: targetPath ?? "null",
      placement,
      sameColumn: sourceColumnKey === targetColumnKey,
    });

    this.updateLocalCardOrderForDrop(
      sourceColumnKey,
      targetColumnKey,
      draggedPaths,
      targetPath,
      placement,
    );

    logDebug("DROP", "Local card order updated, calling mutation service");

    await this.mutationService.handleDrop({
      groupByProperty,
      groupByPropertyKey: getWritablePropertyKey(groupByProperty),
      groupKey,
      draggedPaths,
      entryByPath: this.entryByPath,
    });

    if (sourceColumnKey === targetColumnKey) {
      logDragEvent("Same column drop - skipping render (rely on reactivity)");
    } else {
      logDragEvent("Cross-column drop - expecting re-render from data update");
    }
  }

  private getColumnCardPaths(columnKey: string): string[] {
    const columnEl = this.getColumnEl(columnKey);
    if (columnEl === null) {
      return [];
    }

    const cards = columnEl.querySelectorAll<HTMLElement>(".bases-kanban-card");
    const paths: string[] = [];
    cards.forEach((cardEl) => {
      const path = cardEl.dataset.cardPath;
      if (typeof path === "string" && path.length > 0) {
        paths.push(path);
      }
    });

    return paths;
  }

  static getViewOptions() {
    return getKanbanViewOptions();
  }
}
