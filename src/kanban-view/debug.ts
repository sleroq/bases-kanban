// Debug logging utilities that compile out in production
// Uses esbuild's define feature to replace DEBUG_ENABLED at build time

declare const DEBUG_ENABLED: boolean;
declare const DEBUG_RENDERS: boolean;
declare const DEBUG_DRAG: boolean;
declare const DEBUG_SCROLL: boolean;
declare const DEBUG_CACHE: boolean;

declare global {
  interface Window {
    __KANBAN_DEBUG__?: boolean;
    __KANBAN_DEBUG_RENDERS__?: boolean;
    __KANBAN_DEBUG_DRAG__?: boolean;
    __KANBAN_DEBUG_SCROLL__?: boolean;
    __KANBAN_DEBUG_CACHE__?: boolean;
  }
}

const isDebugEnabled = (): boolean => {
  // Check runtime flag first (set in console: window.__KANBAN_DEBUG__ = true)
  if (typeof window !== "undefined" && window.__KANBAN_DEBUG__ === true) {
    return true;
  }
  // Fall back to build-time flag
  return typeof DEBUG_ENABLED !== "undefined" ? DEBUG_ENABLED : false;
};

const shouldLogRender = (): boolean => {
  if (
    typeof window !== "undefined" &&
    window.__KANBAN_DEBUG_RENDERS__ === true
  ) {
    return true;
  }
  return typeof DEBUG_RENDERS !== "undefined" ? DEBUG_RENDERS : false;
};

const shouldLogDrag = (): boolean => {
  if (typeof window !== "undefined" && window.__KANBAN_DEBUG_DRAG__ === true) {
    return true;
  }
  return typeof DEBUG_DRAG !== "undefined" ? DEBUG_DRAG : false;
};

const shouldLogScroll = (): boolean => {
  if (
    typeof window !== "undefined" &&
    window.__KANBAN_DEBUG_SCROLL__ === true
  ) {
    return true;
  }
  return typeof DEBUG_SCROLL !== "undefined" ? DEBUG_SCROLL : false;
};

const shouldLogCache = (): boolean => {
  if (typeof window !== "undefined" && window.__KANBAN_DEBUG_CACHE__ === true) {
    return true;
  }
  return typeof DEBUG_CACHE !== "undefined" ? DEBUG_CACHE : false;
};

// Render event logging
export function logRenderEvent(
  event: string,
  details?: Record<string, unknown>,
): void {
  if (!isDebugEnabled() || !shouldLogRender()) return;
  const timestamp = new Date().toISOString().split("T")[1]?.split(".")[0];
  console.log(`[${timestamp}] [RENDER] ${event}`, details ?? "");
}

// Drag-drop event logging
export function logDragEvent(
  event: string,
  details?: Record<string, unknown>,
): void {
  if (!isDebugEnabled() || !shouldLogDrag()) return;
  const timestamp = new Date().toISOString().split("T")[1]?.split(".")[0];
  console.log(`[${timestamp}] [DRAG] ${event}`, details ?? "");
}

// Scroll event logging
export function logScrollEvent(
  event: string,
  details?: Record<string, unknown>,
): void {
  if (!isDebugEnabled() || !shouldLogScroll()) return;
  const timestamp = new Date().toISOString().split("T")[1]?.split(".")[0];
  console.log(`[${timestamp}] [SCROLL] ${event}`, details ?? "");
}

// Cache event logging
export function logCacheEvent(
  event: string,
  details?: Record<string, unknown>,
): void {
  if (!isDebugEnabled() || !shouldLogCache()) return;
  const timestamp = new Date().toISOString().split("T")[1]?.split(".")[0];
  console.log(`[${timestamp}] [CACHE] ${event}`, details ?? "");
}

// General debug logging
export function logDebug(
  category: string,
  message: string,
  data?: unknown,
): void {
  if (!isDebugEnabled()) return;
  const timestamp = new Date().toISOString().split("T")[1]?.split(".")[0];
  if (data !== undefined) {
    console.log(`[${timestamp}] [${category}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [${category}] ${message}`);
  }
}

// Measure and log function execution time
export function measureTime<T>(label: string, fn: () => T, thresholdMs = 0): T {
  if (!isDebugEnabled()) {
    return fn();
  }

  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;

  if (duration >= thresholdMs) {
    const timestamp = new Date().toISOString().split("T")[1]?.split(".")[0];
    console.log(`[${timestamp}] [PERF] ${label}: ${duration.toFixed(2)}ms`);
  }

  return result;
}

// Async version of measureTime
export async function measureTimeAsync<T>(
  label: string,
  fn: () => Promise<T>,
  thresholdMs = 0,
): Promise<T> {
  if (!isDebugEnabled()) {
    return fn();
  }

  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  if (duration >= thresholdMs) {
    const timestamp = new Date().toISOString().split("T")[1]?.split(".")[0];
    console.log(`[${timestamp}] [PERF] ${label}: ${duration.toFixed(2)}ms`);
  }

  return result;
}

// Check if debug mode is active (useful for conditional UI elements)
export function isDebugModeActive(): boolean {
  return isDebugEnabled();
}
