// 职业听力监护 · 本机保存层
// 只负责 localStorage 的读写，数据结构与判定均不感知。

import { DataStore } from "../domain/types";

const STORAGE_KEY = "hxwl-hearing-monitor-v1";

export function loadStore(): DataStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DataStore;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStore(store: DataStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 隐私模式或配额不足时静默失败，页面仍可在内存中使用
  }
}

export function clearStore(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
