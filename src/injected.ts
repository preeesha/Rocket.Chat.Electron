import { RocketChatDesktopAPI } from './servers/preload/api';

declare global {
  interface Window {
    RocketChatDesktop: RocketChatDesktopAPI;
  }
}

const start = (): void => {
  if (typeof window.require !== 'function') {
    return;
  }

  const { Info: serverInfo = {} } =
    window.require('/app/utils/rocketchat.info') ?? {};

  if (!serverInfo.version) {
    return;
  }

  window.RocketChatDesktop.setServerInfo(serverInfo);

  const { Meteor } = window.require('meteor/meteor');
  const { Session } = window.require('meteor/session');
  const { Tracker } = window.require('meteor/tracker');
  const { UserPresence } = window.require('meteor/konecty:user-presence');
  const { settings } = window.require('/app/settings');
  const { getUserPreference } = window.require('/app/utils');

  window.RocketChatDesktop.setUrlResolver(Meteor.absoluteUrl);

  Tracker.autorun(() => {
    const unread = Session.get('unread');
    window.RocketChatDesktop.setBadge(unread);
  });

  Tracker.autorun(() => {
    const { url, defaultUrl } = settings.get('Assets_favicon') || {};
    window.RocketChatDesktop.setFavicon(url || defaultUrl);
  });

  Tracker.autorun(() => {
    const { url, defaultUrl } = settings.get('Assets_background') || {};
    window.RocketChatDesktop.setBackground(url || defaultUrl);
  });

  Tracker.autorun(() => {
    const siteName = settings.get('Site_Name');
    window.RocketChatDesktop.setTitle(siteName);
  });

  Tracker.autorun(() => {
    const uid = Meteor.userId();
    const isAutoAwayEnabled: unknown = getUserPreference(uid, 'enableAutoAway');
    const idleThreshold: unknown = getUserPreference(uid, 'idleTimeLimit');

    if (isAutoAwayEnabled) {
      delete UserPresence.awayTime;
      UserPresence.start();
    }

    window.RocketChatDesktop.setUserPresenceDetection({
      isAutoAwayEnabled: Boolean(isAutoAwayEnabled),
      idleThreshold: idleThreshold ? Number(idleThreshold) : null,
      setUserOnline: (online) => {
        if (!online) {
          Meteor.call('UserPresence:away');
          return;
        }
        Meteor.call('UserPresence:online');
      },
    });
  });

  const destroyPromiseSymbol = Symbol('destroyPromise');

  window.Notification = class RocketChatDesktopNotification
    extends EventTarget
    implements Notification {
    static readonly permission: NotificationPermission = 'granted';

    static readonly maxActions: number =
      process.platform === 'darwin' ? Number.MAX_SAFE_INTEGER : 0;

    static requestPermission(): Promise<NotificationPermission> {
      return Promise.resolve(RocketChatDesktopNotification.permission);
    }

    [destroyPromiseSymbol]?: Promise<() => void>;

    constructor(
      title: string,
      options: NotificationOptions & { canReply?: boolean } = {}
    ) {
      super();

      for (const eventType of ['show', 'close', 'click', 'reply', 'action']) {
        const propertyName = `on${eventType}`;
        const propertySymbol = Symbol(propertyName);

        Object.defineProperty(this, propertyName, {
          get: () => this[propertySymbol],
          set: (value) => {
            if (this[propertySymbol]) {
              this.removeEventListener(eventType, this[propertySymbol]);
            }

            this[propertySymbol] = value;

            if (this[propertySymbol]) {
              this.addEventListener(eventType, this[propertySymbol]);
            }
          },
        });
      }

      this[destroyPromiseSymbol] = window.RocketChatDesktop.createNotification({
        title,
        ...options,
        onEvent: this.handleEvent,
      }).then((id) => () => {
        window.RocketChatDesktop.destroyNotification(id);
      });

      Object.assign(this, { title, ...options });
    }

    actions: readonly NotificationAction[] = [];

    badge = '';

    body = '';

    data: any = undefined;

    dir: NotificationDirection = 'auto';

    icon = '';

    image = '';

    lang = document.documentElement.lang;

    onclick: ((this: Notification, ev: Event) => any) | null = null;

    onclose: ((this: Notification, ev: Event) => any) | null = null;

    onerror: ((this: Notification, ev: Event) => any) | null = null;

    onshow: ((this: Notification, ev: Event) => any) | null = null;

    renotify = false;

    requireInteraction = false;

    silent = false;

    tag = '';

    timestamp: number = Date.now();

    title = '';

    vibrate: readonly number[] = [];

    private handleEvent = ({
      type,
      detail,
    }: {
      type: string;
      detail: unknown;
    }): void => {
      const mainWorldEvent = new CustomEvent(type, { detail });

      const isReplyEvent = (
        type: string,
        detail: unknown
      ): detail is { reply: string } =>
        type === 'reply' &&
        typeof detail === 'object' &&
        detail !== null &&
        'reply' in detail &&
        typeof (detail as { reply: string }).reply === 'string';

      if (isReplyEvent(type, detail)) {
        (mainWorldEvent as any).response = detail.reply;
      }
      this.dispatchEvent(mainWorldEvent);
    };

    close(): void {
      if (!this[destroyPromiseSymbol]) {
        return;
      }

      this[destroyPromiseSymbol]?.then((destroy) => {
        delete this[destroyPromiseSymbol];
        destroy();
      });
    }
  };
};

start();
