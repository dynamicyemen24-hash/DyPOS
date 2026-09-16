// (c) 2025 المنافذ الذكية للبرمجيات
import { useState, useCallback } from "react";
import { POSNotification } from "../types";
import { generateId } from "../utils/currency";

export function usePOSNotifications() {
  const [notifications, setNotifications] = useState<POSNotification[]>([]);

  const notify = useCallback((type: POSNotification["type"], title: string, message: string) => {
    const notification: POSNotification = {
      id: generateId(),
      type,
      title,
      message,
      timestamp: Date.now(),
      read: false,
    };
    setNotifications((prev) => [notification, ...prev].slice(0, 50));
    return notification;
  }, []);

  const success = useCallback((title: string, message: string) => notify("success", title, message), [notify]);
  const error = useCallback((title: string, message: string) => notify("error", title, message), [notify]);
  const warning = useCallback((title: string, message: string) => notify("warning", title, message), [notify]);
  const info = useCallback((title: string, message: string) => notify("info", title, message), [notify]);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  return {
    notifications,
    notify,
    success,
    error,
    warning,
    info,
    markAsRead,
    clearAll,
  };
}
