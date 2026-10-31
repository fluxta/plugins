import type {
  Player,
  PlayerEvents,
  PlayOptions,
  Provider,
  Song,
  Track,
} from "../songs/provider";

export class FakePlayer implements Player {
  ready = false;
  events?: PlayerEvents;
  readonly played: { song: Song; options: PlayOptions }[] = [];
  paused = false;
  volume = 100;
  stopped = false;

  attach(events: PlayerEvents) {
    this.events = events;
  }
  connect() {
    this.ready = true;
    this.events?.ready();
  }
  disconnect() {
    this.ready = false;
    this.events?.disconnected();
  }
  play(song: Song, options: PlayOptions) {
    this.played.push({ song, options });
    this.paused = options.paused ?? false;
    this.volume = options.volume ?? 100;
    this.stopped = false;
  }
  unmute() {}
  stop() {
    this.stopped = true;
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
  }
  setVolume(volume: number) {
    this.volume = volume;
  }
  load() {
    const song = this.played.at(-1)!.song;
    this.events?.loaded(song.id, song.duration ?? 120);
    return song;
  }
}

export function fakeProvider(
  id = "fake",
  player = new FakePlayer(),
  trackDetails: Partial<Track> = {},
) {
  const provider: Provider = {
    id,
    player,
    claims: (request) => request.startsWith(`${id}:`),
    async resolve(request) {
      const [title, seconds] = request.replace(`${id}:`, "").split("@");
      return {
        kind: "track",
        track: {
          provider: id,
          trackId: title,
          title,
          channel: "Channel",
          channelUrl: `${id}://channel`,
          url: `${id}://${title}`,
          duration: seconds === undefined ? undefined : Number(seconds),
          ...trackDetails,
        },
      };
    },
  };
  return { provider, player };
}
