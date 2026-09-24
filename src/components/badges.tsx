// 页面层共享：徽标与小工具

import type { Disposition, TaskStatus } from "../monitoring/types";
import type { EmployeeStatus } from "../monitoring/rules";

export function Badge({
  tone,
  children,
}: {
  tone: "ok" | "watch" | "danger" | "muted";
  children: React.ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function dispositionTone(d: Disposition): "ok" | "watch" | "danger" | "muted" {
  switch (d) {
    case "retest":
      return "watch";
    case "intervention":
      return "danger";
    case "baseline":
    case "normal":
    case "cleared":
      return "ok";
    default:
      return "muted";
  }
}

export function taskTone(s: TaskStatus): "ok" | "watch" | "danger" | "muted" {
  switch (s) {
    case "overdue":
    case "intervention":
      return "danger";
    case "open":
      return "watch";
    case "cleared":
      return "ok";
  }
}

export function employeeTone(s: EmployeeStatus): "ok" | "watch" | "danger" | "muted" {
  switch (s) {
    case "intervention":
    case "overdue":
      return "danger";
    case "open":
      return "watch";
    case "normal":
      return "ok";
    default:
      return "muted";
  }
}

export function dayDiff(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T00:00:00").getTime();
  const b = new Date(toISO + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}
