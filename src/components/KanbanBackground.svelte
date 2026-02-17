<script lang="ts">
  import type { App } from "obsidian";
  import { untrack } from "svelte";
  import { applyBackground, createBackgroundManagerState, type BackgroundConfig } from "../kanban-view/background-manager";

  interface Props {
    app: App;
    rootEl: HTMLElement;
    config: BackgroundConfig;
  }

  let { app, rootEl, config }: Props = $props();

  // State is mutated imperatively by applyBackground, so we use untrack
  // to prevent state mutations from re-triggering this effect
  const state = createBackgroundManagerState();

  // Apply background whenever config changes
  $effect(() => {
    // Capture config reactivity
    const currentConfig = config;
    untrack(() => {
      applyBackground(app, rootEl, state, currentConfig);
    });
  });
</script>

<!-- Background is applied imperatively via the background-manager -->
