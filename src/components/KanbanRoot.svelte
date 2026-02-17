<script lang="ts">
  import type { BasesEntry, BasesPropertyId, BasesEntryGroup, App } from "obsidian";
  import KanbanBoard from "./KanbanBoard.svelte";
  import KanbanBackground from "./KanbanBackground.svelte";

  interface Props {
    app: App;
    rootEl: HTMLElement;
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
    backgroundImage: unknown;
    backgroundBrightness: number;
    backgroundBlur: number;
    columnTransparency: number;
    columnBlur: number;
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
    app,
    rootEl,
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
    backgroundImage,
    backgroundBrightness,
    backgroundBlur,
    columnTransparency,
    columnBlur,
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

  const backgroundConfig = $derived({
    imageInput: backgroundImage,
    brightness: backgroundBrightness,
    blur: backgroundBlur,
    columnTransparency,
    columnBlur,
  });
</script>

<KanbanBackground
  {app}
  {rootEl}
  config={backgroundConfig}
/>

<KanbanBoard
  {groups}
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
  {draggingColumnKey}
  {columnDropTargetKey}
  {columnDropPlacement}
  {draggingSourcePath}
  {cardDropTargetPath}
  {cardDropPlacement}
  {onStartColumnDrag}
  {onEndColumnDrag}
  {onColumnDragOver}
  {onColumnDragLeave}
  {onColumnDrop}
  {onCreateCard}
  {onCardSelect}
  {onCardDragStart}
  {onCardDragEnd}
  {onCardDragOver}
  {onCardDragLeave}
  {onCardDrop}
  {onCardContextMenu}
  {onCardLinkClick}
  {onCardsScroll}
  {onBoardScroll}
  {onBoardKeyDown}
  {onBoardClick}
/>
