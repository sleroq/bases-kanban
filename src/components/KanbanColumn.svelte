<script lang="ts">
  import type { BasesEntry, BasesPropertyId } from "obsidian";
  import KanbanCard from "./KanbanCard.svelte";
  import { getColumnName, getColumnKey } from "../kanban-view/utils";

  interface Props {
    columnKey: string;
    groupKey: unknown;
    entries: BasesEntry[];
    startCardIndex: number;
    groupByProperty: BasesPropertyId | null;
    selectedProperties: BasesPropertyId[];
    selectedPaths: Set<string>;
    cardTitleSource: "basename" | "filename" | "path";
    cardTitleMaxLength: number;
    propertyValueSeparator: string;
    tagPropertySuffix: string;
    tagSaturation: number;
    tagLightness: number;
    tagAlpha: number;
    columnHeaderWidth: number;
    emptyColumnLabel: string;
    addCardButtonText: string;
    isDraggingColumn: boolean;
    isDropTarget: boolean;
    dropPlacement: "before" | "after" | null;
    draggingSourcePath: string | null;
    cardDropTargetPath: string | null;
    cardDropPlacement: "before" | "after" | null;
    onStartColumnDrag: (evt: DragEvent, columnKey: string) => void;
    onEndColumnDrag: () => void;
    onColumnDragOver: (evt: DragEvent, columnKey: string) => void;
    onColumnDragLeave: () => void;
    onColumnDrop: (evt: DragEvent, columnKey: string) => void;
    onCreateCard: () => void;
    onCardSelect: (filePath: string, extendSelection: boolean) => void;
    onCardDragStart: (evt: DragEvent, filePath: string, cardIndex: number) => void;
    onCardDragEnd: () => void;
    onCardDragOver: (evt: DragEvent, filePath: string) => void;
    onCardDragLeave: (filePath: string) => void;
    onCardDrop: (evt: DragEvent, filePath: string | null) => void;
    onCardContextMenu: (evt: MouseEvent, entry: BasesEntry) => void;
    onCardLinkClick: (evt: MouseEvent, target: string) => void;
    onCardsScroll: (scrollTop: number) => void;
    onBoardKeyDown: (evt: KeyboardEvent) => void;
    onBoardClick: (evt: MouseEvent) => void;
  }

  let {
    columnKey,
    groupKey,
    entries,
    startCardIndex,
    groupByProperty,
    selectedProperties,
    selectedPaths,
    cardTitleSource,
    cardTitleMaxLength,
    propertyValueSeparator,
    tagPropertySuffix,
    tagSaturation,
    tagLightness,
    tagAlpha,
    columnHeaderWidth,
    emptyColumnLabel,
    addCardButtonText,
    isDraggingColumn,
    isDropTarget,
    dropPlacement,
    draggingSourcePath,
    cardDropTargetPath,
    cardDropPlacement,
    onStartColumnDrag,
    onEndColumnDrag,
    onColumnDragOver,
    onColumnDragLeave,
    onColumnDrop,
    onCreateCard,
    onCardSelect,
    onCardDragStart,
    onCardDragEnd,
    onCardDragOver,
    onCardDragLeave,
    onCardDrop,
    onCardContextMenu,
    onCardLinkClick,
    onCardsScroll,
    onBoardKeyDown,
    onBoardClick,
  }: Props = $props();

  let columnEl: HTMLElement | null = $state(null);
  let cardsEl: HTMLElement | null = $state(null);
  let scrollTimeout: ReturnType<typeof setTimeout> | null = $state(null);

  const columnName = getColumnName(groupKey, emptyColumnLabel);

  function handleColumnDragStart(evt: DragEvent): void {
    onStartColumnDrag(evt, columnKey);
  }

  function handleColumnDragOver(evt: DragEvent): void {
    if (!isDraggingColumn) return;
    evt.preventDefault();
    onColumnDragOver(evt, columnKey);
  }

  function handleColumnDragLeave(evt: DragEvent): void {
    const relatedTarget = evt.relatedTarget as Node | null;
    if (columnEl !== null && relatedTarget !== null && columnEl.contains(relatedTarget)) {
      return;
    }
    onColumnDragLeave();
  }

  function handleColumnDrop(evt: DragEvent): void {
    if (!isDraggingColumn) return;
    evt.preventDefault();
    onColumnDrop(evt, columnKey);
  }

  function handleCardsDragOver(evt: DragEvent): void {
    if (groupByProperty === null || draggingSourcePath === null) return;
    evt.preventDefault();
  }

  function handleCardsDrop(evt: DragEvent): void {
    evt.preventDefault();
    onCardDrop(evt, null);
  }

  function handleCardsScroll(): void {
    if (cardsEl === null) return;
    if (scrollTimeout !== null) {
      clearTimeout(scrollTimeout);
    }
    scrollTimeout = setTimeout(() => {
      onCardsScroll(cardsEl!.scrollTop);
    }, 100);
  }

  function handleCreateCardClick(evt: MouseEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
    onCreateCard();
  }

  function handleCreateCardMouseDown(evt: MouseEvent): void {
    evt.stopPropagation();
  }

  function isCardDropTarget(filePath: string): boolean {
    return cardDropTargetPath === filePath;
  }

  function isCardDraggingSource(filePath: string): boolean {
    return draggingSourcePath === filePath;
  }

  function getCardDropPlacement(filePath: string): "before" | "after" | null {
    return cardDropTargetPath === filePath ? cardDropPlacement : null;
  }
</script>

<div
  bind:this={columnEl}
  class="bases-kanban-column"
  class:bases-kanban-column-drop-before={isDropTarget && dropPlacement === "before"}
  class:bases-kanban-column-drop-after={isDropTarget && dropPlacement === "after"}
  data-column-key={columnKey}
  style:--bases-kanban-column-header-width="{columnHeaderWidth}px"
  ondragover={handleColumnDragOver}
  ondragleave={handleColumnDragLeave}
  ondrop={handleColumnDrop}
  role="region"
  aria-label={columnName}
>
  <div
    class="bases-kanban-column-header"
  >
    <div
      class="bases-kanban-column-handle"
      draggable="true"
      ondragstart={handleColumnDragStart}
      ondragend={onEndColumnDrag}
      role="button"
      tabindex="0"
      aria-label="Drag to reorder column"
    >
      <h3 style:width="{columnHeaderWidth}px">{columnName}</h3>
    </div>
    <span class="bases-kanban-column-count">{entries.length}</span>
    <button
      type="button"
      class="bases-kanban-add-card-button"
      aria-label="Add card to {columnName}"
      draggable="false"
      onmousedown={handleCreateCardMouseDown}
      onclick={handleCreateCardClick}
    >
      {addCardButtonText}
    </button>
  </div>

  <div
    bind:this={cardsEl}
    class="bases-kanban-cards"
    class:bases-kanban-drop-target={cardDropTargetPath !== null}
    ondragover={handleCardsDragOver}
    ondrop={handleCardsDrop}
    onscroll={handleCardsScroll}
    role="list"
  >
    {#each entries as entry, i (entry.file.path)}
      {@const filePath = entry.file.path}
      {@const cardIndex = startCardIndex + i}
      <KanbanCard
        {entry}
        {groupKey}
        {cardIndex}
        {groupByProperty}
        {selectedProperties}
        selected={selectedPaths.has(filePath)}
        {cardTitleSource}
        {cardTitleMaxLength}
        {propertyValueSeparator}
        {tagPropertySuffix}
        {tagSaturation}
        {tagLightness}
        {tagAlpha}
        isDraggingSource={isCardDraggingSource(filePath)}
        isDropTarget={isCardDropTarget(filePath)}
        dropPlacement={getCardDropPlacement(filePath)}
        onSelect={onCardSelect}
        onDragStart={onCardDragStart}
        onDragEnd={onCardDragEnd}
        onDragOver={onCardDragOver}
        onDragLeave={onCardDragLeave}
        onDrop={onCardDrop}
        onContextMenu={(evt) => onCardContextMenu(evt, entry)}
        onLinkClick={onCardLinkClick}
      />
    {/each}
  </div>
</div>
