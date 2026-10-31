/** The host transport boundary, driven without a Fluxta process. */
export class HostSocket {
  static instances: HostSocket[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number; reason: string }) => void;
  readonly sent: unknown[] = [];

  constructor() {
    HostSocket.instances.push(this);
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  open() {
    this.onopen?.();
    this.receive({ type: "event", event: { event: "authenticated" } });
  }
  close() {
    this.onclose?.({ code: 1006, reason: "" });
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}
