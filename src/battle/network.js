const KEY = "oreka-room-session-v1";
export function savedSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY));
    return value &&
      typeof value.code === "string" &&
      typeof value.token === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}
function storeSession(value) {
  try {
    value
      ? sessionStorage.setItem(KEY, JSON.stringify(value))
      : sessionStorage.removeItem(KEY);
  } catch {
    /* storage may be disabled */
  }
}
export class RoomConnection {
  constructor(onMessage, onConnection) {
    this.onMessage = onMessage;
    this.onConnection = onConnection;
    this.session = null;
    this.socket = null;
    this.stopped = false;
    this.retries = 0;
    this.timer = null;
  }
  open(message) {
    this.initial = message;
    if (message.type === "resume")
      this.session = { code: message.code, token: message.token };
    this.connect();
  }
  connect() {
    if (this.stopped) return;
    this.onConnection(
      false,
      this.retries
        ? "通信が切れました。90秒以内の復帰を試みています…"
        : "通信サーバーに接続しています…",
    );
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${scheme}//${location.host}/socket`);
    this.socket = socket;
    const openTimeout = setTimeout(() => socket.close(), 8000);
    socket.addEventListener("open", () => {
      clearTimeout(openTimeout);
      socket.send(
        JSON.stringify(
          this.session ? { type: "resume", ...this.session } : this.initial,
        ),
      );
    });
    socket.addEventListener("message", (event) => {
      if (this.stopped || this.socket !== socket) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "session") {
        this.session = { code: message.code, token: message.token };
        storeSession(this.session);
        this.retries = 0;
        this.onConnection(true, "接続しました。");
      }
      if (["expired", "left", "replaced"].includes(message.type)) {
        storeSession(null);
        this.session = null;
        this.stopped = true;
        socket.close();
      }
      this.onMessage(message);
      if (message.type === "error" && !this.session) {
        this.stopped = true;
        socket.close();
      }
    });
    socket.addEventListener("error", () => {});
    socket.addEventListener("close", () => {
      clearTimeout(openTimeout);
      if (this.stopped || this.socket !== socket) return;
      if (this.session && this.retries < 20) {
        this.retries++;
        this.onConnection(
          false,
          "通信が切れました。90秒以内の復帰を試みています…",
        );
        this.timer = setTimeout(
          () => this.connect(),
          Math.min(4000, 700 + this.retries * 300),
        );
      } else {
        this.onConnection(
          false,
          "接続できませんでした。通信サーバーの起動とネット接続を確認してください。CPU対戦はそのまま遊べます。",
          true,
        );
        storeSession(null);
        this.stopped = true;
      }
    });
  }
  send(message) {
    if (this.stopped || this.socket?.readyState !== WebSocket.OPEN)
      throw new Error("再接続を待ってください。");
    this.socket.send(JSON.stringify(message));
  }
  leave() {
    if (this.socket?.readyState === WebSocket.OPEN && this.session)
      this.socket.send(JSON.stringify({ type: "leave" }));
    this.stopped = true;
    clearTimeout(this.timer);
    storeSession(null);
    this.session = null;
    this.socket?.close();
  }
}
