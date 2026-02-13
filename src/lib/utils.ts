import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** 페이지 내 추가/삭제/수정 등 변동 후 호출하면 알림 버튼이 최신 상태를 다시 조회합니다. */
export function notifyNotificationCheck() {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cb-notification-check"));
    }
}
