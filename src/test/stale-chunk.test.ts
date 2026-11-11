import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installStaleChunkGuard,
  isChunkLoadError,
  recentlyReloaded,
  reloadForNewVersion,
} from "@/lib/stale-chunk";

const reload = vi.fn();

beforeEach(() => {
  window.sessionStorage.clear();
  reload.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
});
afterEach(() => vi.restoreAllMocks());

describe("isChunkLoadError", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://x.vercel.app/assets/painel.backup-BZs6rQg3.js",
    "error loading dynamically imported module: /assets/a.js",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/a.css",
    "Loading chunk 12 failed.",
  ])("reconhece: %s", (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it("não confunde erro comum de uma tela", () => {
    expect(
      isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')")),
    ).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("reloadForNewVersion", () => {
  it("recarrega uma vez e não entra em laço", () => {
    expect(reloadForNewVersion(1_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(recentlyReloaded(1_030_000)).toBe(true);
    expect(reloadForNewVersion(1_030_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("depois de 1 minuto pode recarregar de novo", () => {
    reloadForNewVersion(1_000_000);
    expect(reloadForNewVersion(1_061_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("funciona mesmo sem sessionStorage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(reloadForNewVersion()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("installStaleChunkGuard", () => {
  it("recarrega quando o Vite avisa que um arquivo não carregou", () => {
    installStaleChunkGuard();
    const ev = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(ev);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });
});
