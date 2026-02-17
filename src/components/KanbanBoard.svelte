<script lang="ts">
  import type { BasesEntry, BasesPropertyId, BasesEntryGroup } from "obsidian";
  import KanbanColumn from "./KanbanColumn.svelte";

  interface Props {
    groups: Array<{ group: BasesEntryGroup; entries: BasesEntry[] }>;
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
    draggingColumnKey: string | null;
    columnDropTargetKey: string | null;
    columnDropPlacement: "before" | "after" | null;
    draggingSourcePath: string | null;
    cardDropTargetPath: string | null;
    cardDropPlacement: "before" | "after" | null;
    onStartColumnDrag: (evt: DragEvent, columnKey: string) => void;
    onEndColumnDrag: () => void;
    onColumnDragOver: (evt: DragEvent, columnKey: string) => void;
    onColumnDragLeave: () => void;
    onColumnDrop: (evt: DragEvent, columnKey: string) => void;
    onCreateCard: (groupByProperty: BasesPropertyId | null, groupKey: unknown) => void;
    onCardSelect: (filePath: string, extendSelection: boolean) => void;
    onCardDragStart: (evt: DragEvent, filePath: string, cardIndex: number) => void;
    onCardDragEnd: () => void;
    onCardDragOver: (evt: DragEvent, filePath: string) => void;
    onCardDragLeave: (filePath: string) => void;
    onCardDrop: (evt: DragEvent, filePath: string | null, groupKey: unknown) => void;
    onCardContextMenu: (evt: MouseEvent, entry: BasesEntry) => void;
    onCardLinkClick: (evt: MouseEvent, target: string) => void;
    onCardsScroll: (columnKey: string, scrollTop: number) => void;
    onBoardScroll: (scrollLeft: number, scrollTop: number) => void;
    onBoardKeyDown: (evt: KeyboardEvent) => void;
    onBoardClick: (evt: MouseEvent) => void;
  }

  let {
    groups,
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
    draggingColumnKey,
    columnDropTargetKey,
    columnDropPlacement,
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
    onBoardScroll,
    onBoardKeyDown,
    onBoardClick,
  }: Props = $props();

  let boardEl: HTMLElement | null = $state(null);

  function getColumnKey(groupKey: unknown): string {
    if (groupKey === undefined || groupKey === null) {
      return "__bases_kanban_no_value__";
    }
    return String(groupKey);
  }

  function handleBoardScroll(): void {
    if (boardEl === null) return;
    onBoardScroll(boardEl.scrollLeft, boardEl.scrollTop);
  }

  function handleBoardClick(evt: MouseEvent): void {
    if ((evt.target as HTMLElement).closest(".bases-kanban-card") !== null) {
      return;
    }
    onBoardClick(evt);
  }

  function isColumnDropTarget(columnKey: string): boolean {
    return columnDropTargetKey === columnKey;
  }

  function getColumnDropPlacement(columnKey: string): "before" | "after" | null {
    return columnDropTargetKey === columnKey ? columnDropPlacement : null;
  }

  let cardIndex = 0;
</script>

<div
  bind:this={boardEl}
  class="bases-kanban-board"
  data-keyboard-bound="true"
  tabindex="0"
  onkeydown={onBoardKeyDown}
  onclick={handleBoardClick}
  onscroll={handleBoardScroll}
  role="region"
  aria-label="Kanban board"
>
  {#each groups as { group, entries } (getColumnKey(group.key))}
    {@const columnKey = getColumnKey(group.key)}
    {@const groupKey = group.key}
    {@const startIndex = cardIndex}
    {@const groupEntries = entries}
    <KanbanColumn
      {columnKey}
      {groupKey}
      entries={groupEntries}
      startCardIndex={startIndex}
      {groupByProperty}
      {selectedProperties}
      {selectedPaths}
      {cardTitleSource}
      {cardTitleMaxLength}
      {propertyValueSeparator}
      {tagPropertySuffix}
      {tagSaturation}
      {tagLightness}
      {tagAlpha}
      {columnHeaderWidth}
      {emptyColumnLabel}
      {addCardButtonText}
      isDraggingColumn={draggingColumnKey !== null}
      isDropTarget={isColumnDropTarget(columnKey)}
      dropPlacement={getColumnDropPlacement(columnKey)}
      {draggingSourcePath}
      {cardDropTargetPath}
      {cardDropPlacement}
      {onStartColumnDrag}
      {onEndColumnDrag}
      onColumnDragOver={onColumnDragOver}
      onColumnDragLeave={onColumnDragLeave}
      onColumnDrop={onColumnDrop}
      onCreateCard={() => onCreateCard(groupByProperty, group.key)}
      {onCardSelect}
      {onCardDragStart}
      {onCardDragEnd}
      {onCardDragOver}
      {onCardDragLeave}
      onCardDrop={(evt, filePath) => onCardDrop(evt, filePath, group.key)}
      {onCardContextMenu}
      {onCardLinkClick}
      onCardsScroll={(scrollTop) => onCardsScroll(columnKey, scrollTop)}
      {onBoardKeyDown}
      {onBoardClick}
    />
    {cardIndex = startIndex + entries.length, ""}
  {/each}
</div>
