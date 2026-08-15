import { useEffect, useState, useCallback } from "react";
import {
  isPushSupported,
  isStandalone,
  isIOS,
  subscribeUser,
  unsubscribeUser,
  getCurrentSubscription,
  isCurrentSubscriptionRegistered,
} from "@/lib/push";

export interface PushNotificationsState {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  localSubscribed: boolean;
  backendRegistered: boolean;
  standalone: boolean;
  needsIosInstall: boolean;
  loading: boolean;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationsState>({
    supported: false,
    permission: "default",
    subscribed: false,
    localSubscribed: false,
    backendRegistered: false,
    standalone: false,
    needsIosInstall: false,
    loading: true,
  });

  const refresh = useCallback(async () => {
    const supported = isPushSupported();
    const standalone = isStandalone();
    const ios = isIOS();
    let permission: NotificationPermission | "unsupported" = supported ? Notification.permission : "unsupported";
    let localSubscribed = false;
    let backendRegistered = false;
    if (supported) {
      const sub = await getCurrentSubscription();
      localSubscribed = !!sub && permission === "granted";
      if (localSubscribed) {
        backendRegistered = await isCurrentSubscriptionRegistered();
      }
    }
    setState({
      supported,
      permission,
      subscribed: localSubscribed && backendRegistered,
      localSubscribed,
      backendRegistered,
      standalone,
      needsIosInstall: ios && !standalone,
      loading: false,
    });
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const enable = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const result = await subscribeUser();
    await refresh();
    return result;
  }, [refresh]);

  const disable = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    await unsubscribeUser();
    await refresh();
  }, [refresh]);

  return { ...state, enable, disable, refresh };
}
