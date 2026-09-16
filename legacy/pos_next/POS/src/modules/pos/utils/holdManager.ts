// (c) 2025 المنافذ الذكية للبرمجيات
import { POSHoldSession, POSCartItem } from "../types";
import { generateId } from "./currency";

const HOLD_STORAGE_KEY = "sp_pos_holds";
const HOLD_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

export function saveHold(session: POSHoldSession): void {
  const holds = getAllHolds();
  holds.push({ ...session, expiresAt: Date.now() + HOLD_EXPIRY_MS });
  localStorage.setItem(HOLD_STORAGE_KEY, JSON.stringify(holds));
}

export function getAllHolds(): POSHoldSession[] {
  const data = localStorage.getItem(HOLD_STORAGE_KEY);
  if (!data) return [];
  const holds: POSHoldSession[] = JSON.parse(data);
  // Remove expired holds
  const now = Date.now();
  const validHolds = holds.filter((h) => h.expiresAt > now);
  if (validHolds.length !== holds.length) {
    localStorage.setItem(HOLD_STORAGE_KEY, JSON.stringify(validHolds));
  }
  return validHolds;
}

export function getHold(id: string): POSHoldSession | undefined {
  return getAllHolds().find((h) => h.id === id);
}

export function deleteHold(id: string): void {
  const holds = getAllHolds().filter((h) => h.id !== id);
  localStorage.setItem(HOLD_STORAGE_KEY, JSON.stringify(holds));
}

export function clearExpiredHolds(): void {
  const holds = getAllHolds().filter((h) => h.expiresAt > Date.now());
  localStorage.setItem(HOLD_STORAGE_KEY, JSON.stringify(holds));
}

export function createHold(cartItems: POSCartItem[], cashierId: string, customerId?: string): POSHoldSession {
  const hold: POSHoldSession = {
    id: generateId(),
    cartItems: [...cartItems],
    customerId,
    cashierId,
    createdAt: Date.now(),
    expiresAt: Date.now() + HOLD_EXPIRY_MS,
  };
  saveHold(hold);
  return hold;
}

export function resumeHold(id: string): POSHoldSession | null {
  const hold = getHold(id);
  if (!hold || hold.expiresAt < Date.now()) {
    if (hold) deleteHold(hold.id);
    return null;
  }
  return hold;
}

export function getHoldCount(): number {
  return getAllHolds().length;
}
