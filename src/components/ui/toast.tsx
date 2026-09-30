"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CircleAlert, X } from "lucide-react";

type ToastVariant = "default" | "success" | "error";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastContextValue {
  addToast: (toast: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const addToast = React.useCallback((toast: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            // DESIGN.md 토스트: 변형과 관계없이 잉크 면 + chiffon 텍스트. 오류만 아이콘으로 구분한다.
            className="relative flex w-full items-start gap-3 rounded-md bg-primary px-4 py-3 text-chiffon shadow-float"
            onOpenChange={(open) => {
              if (!open) removeToast(toast.id);
            }}
          >
            {toast.variant === "error" && (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
            )}
            <div className="flex-1">
              <ToastPrimitive.Title className="text-body-sm font-semibold">
                {toast.title}
              </ToastPrimitive.Title>
              {toast.description && (
                <ToastPrimitive.Description className="mt-1 text-caption text-chiffon/80">
                  {toast.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close aria-label="닫기" className="shrink-0 rounded-sm p-0.5 opacity-70 transition-opacity duration-150 ease-out hover:opacity-100">
              <X className="h-4 w-4" strokeWidth={1.75} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex w-[380px] max-w-[100vw] flex-col gap-2" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
