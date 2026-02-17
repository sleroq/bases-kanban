<script lang="ts">
  import type { BasesEntry, BasesPropertyId, BasesEntryGroup, App } from "obsidian";
  import type { Readable, Writable } from "svelte/store";
  import KanbanBoard from "./KanbanBoard.svelte";
  import KanbanBackground from "./KanbanBackground.svelte";

  interface DataStoreValue {
    groups: Array<{ group: BasesEntryGroup; entries: BasesEntry[] }>;
    groupByProperty: BasesPropertyId | null;
    selectedProperties: BasesPropertyId[];
    columnScrollByKey: Record<string, number>;
  }

  interface Props {
    app: App;
    rootEl: HTMLElement;
    selectedPathsStore: Readable<Set<string>>;
    initialBoardScrollLeft: number;
    initialBoardScrollTop: number;
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
    dataStore: Writable<DataStoreValue>;
    onCreateCard: (groupByProperty: BasesPropertyId | null, groupKey: unknown) => void;
    onCardSelect: (filePath: string, extendSelection: boolean) => void;
    onCardDragStart: (evt: DragEvent, filePath: string, cardIndex: number) => void;
    onCardDragEnd: () => void;
    onCardDrop: (
      evt: DragEvent,
      filePath: string | null,
      groupKey: unknown,
      placement: "before" | "after",
    ) => void;
    onCardContextMenu: (evt: MouseEvent, entry: BasesEntry) => void;
    onCardLinkClick: (evt: MouseEvent, target: string) => void;
    onCardsScroll: (columnKey: string, scrollTop: number) => void;
    onBoardScroll: (scrollLeft: number, scrollTop: number) => void;
    onBoardKeyDown: (evt: KeyboardEvent) => void;
    onBoardClick: () => void;
    onStartColumnDrag: (evt: DragEvent, columnKey: string) => void;
    onEndColumnDrag: () => void;
    onColumnDrop: (targetKey: string, placement: "before" | "after") => void;
  }

  let {
    app,
    rootEl,
    selectedPathsStore,
    initialBoardScrollLeft,
    initialBoardScrollTop,
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
    dataStore,
    onCreateCard,
    onCardSelect,
    onCardDragStart,
    onCardDragEnd,
    onCardDrop,
    onCardContextMenu,
    onCardLinkClick,
    onCardsScroll,
    onBoardScroll,
    onBoardKeyDown,
    onBoardClick,
    onStartColumnDrag,
    onEndColumnDrag,
    onColumnDrop,
  }: Props = $props();

  const backgroundConfig = $derived({
    imageInput: backgroundImage,
    brightness: backgroundBrightness,
    blur: backgroundBlur,
    columnTransparency,
    columnBlur,
  });

  // Derive reactive data props from store
  const groups = $derived($dataStore.groups);
  const groupByProperty = $derived($dataStore.groupByProperty);
  const selectedProperties = $derived($dataStore.selectedProperties);
  const columnScrollByKey = $derived($dataStore.columnScrollByKey);
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
  {selectedPathsStore}
  {initialBoardScrollLeft}
  {initialBoardScrollTop}
  {columnScrollByKey}
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
  {onCreateCard}
  {onCardSelect}
  {onCardDragStart}
  {onCardDragEnd}
  {onCardDrop}
  {onCardContextMenu}
  {onCardLinkClick}
  {onCardsScroll}
  {onBoardScroll}
  {onBoardKeyDown}
  {onBoardClick}
  {onStartColumnDrag}
  {onEndColumnDrag}
  {onColumnDrop}
/>
