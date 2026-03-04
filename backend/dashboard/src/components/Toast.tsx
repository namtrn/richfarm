import { useEffect, useState } from "react";
import type { Toast as ToastType, ToastType as TType } from "../types";

let toastId = 0;

export function useToast() {
    const [toasts, setToasts] = useState<ToastType[]>([]);

    function addToast(type: TType, message: string) {
        const id = ++toastId;
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3500);
    }

    function dismiss(id: number) {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }

    return { toasts, addToast, dismiss };
}

export function ToastContainer({
    toasts,
    dismiss,
}: {
    toasts: ToastType[];
    dismiss: (id: number) => void;
}) {
    return (
        <div className="toast-container">
            {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} dismiss={dismiss} />
            ))}
        </div>
    );
}

function ToastItem({
    toast,
    dismiss,
}: {
    toast: ToastType;
    dismiss: (id: number) => void;
}) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true));
        const timer = setTimeout(() => setVisible(false), 3000);
        return () => clearTimeout(timer);
    }, []);

    const icons: Record<TType, string> = {
        success: "✓",
        error: "✕",
        info: "ℹ",
    };

    return (
        <div
            className={`toast toast-${toast.type} ${visible ? "toast-enter" : "toast-exit"}`}
            onClick={() => dismiss(toast.id)}
        >
            <span className="toast-icon">{icons[toast.type]}</span>
            <span>{toast.message}</span>
        </div>
    );
}
