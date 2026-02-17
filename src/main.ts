import { Plugin } from "obsidian";
import { KanbanView } from "./kanban-view";
import {
  type BasesKanbanSettings,
  DEFAULT_SETTINGS,
  KanbanSettingTab,
} from "./settings";

export default class BasesKanbanPlugin extends Plugin {
  settings!: BasesKanbanSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new KanbanSettingTab(this.app, this));

    this.registerBasesView("kanban", {
      name: "Kanban",
      icon: "lucide-kanban",
      factory: (controller, containerEl) =>
        new KanbanView(controller, containerEl, this),
      options: () => KanbanView.getViewOptions(),
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.updateCssVariables();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.updateCssVariables();
  }

  private updateCssVariables(): void {
    const root = document.documentElement;
    root.style.setProperty(
      "--bases-kanban-column-width",
      `${this.settings.columnWidth}px`,
    );
    root.style.setProperty(
      "--bases-kanban-drop-indicator-width",
      `${this.settings.dropIndicatorWidth}px`,
    );
    root.style.setProperty(
      "--bases-kanban-tag-text-color",
      this.settings.tagTextColor,
    );
  }
}
