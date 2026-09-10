import { v4 as uuidv4 } from "uuid";
import {
  isEditorMessage,
  validateConnectionDraft,
  type PluginMessage,
} from "obs-protocol";

import { MuteInputAction } from "./actions/mute-input";
import { PauseRecordAction } from "./actions/pause-record";
import { ResumeRecordAction } from "./actions/resume-record";
import { SetInputVolumeAction } from "./actions/set-input-volume";
import { SetSceneAction } from "./actions/set-scene";
import { SetSourceFilterAction } from "./actions/set-source-filter";
import { SetSourceVisibilityAction } from "./actions/set-source-visibility";
import { StartRecordAction } from "./actions/start-record";
import { StartStreamAction } from "./actions/start-stream";
import { StopRecordAction } from "./actions/stop-record";
import { StopStreamAction } from "./actions/stop-stream";
import { UnmuteInputAction } from "./actions/unmute-input";
import { ConnectionsService } from "./connections/service";
import { ConnectionsStore, type StoredSettings } from "./connections/store";
import {
  INPUT_MUTE_CHANGED_EVENT,
  toInputMuteChangedPayload,
} from "./events/input-mute-changed";
import {
  RECORD_STATE_CHANGED_EVENT,
  toRecordStateChangedPayload,
} from "./events/record-state-changed";
import { SCENE_CHANGED_EVENT, toSceneChangedPayload } from "./events/scene-changed";
import {
  SOURCE_FILTER_ENABLED_CHANGED_EVENT,
  toSourceFilterEnabledChangedPayload,
} from "./events/source-filter-enabled-changed";
import {
  SOURCE_VISIBILITY_CHANGED_EVENT,
  toSourceVisibilityChangedPayload,
} from "./events/source-visibility-changed";
import {
  STREAM_STATE_CHANGED_EVENT,
  toStreamStateChangedPayload,
} from "./events/stream-state-changed";
import { readManifestVersion } from "./manifest";
import { listFilters } from "./obs/filters";
import { listInputs } from "./obs/sources";
import { listScenes, listSceneSources } from "./obs/scenes";
import { createConnectionsOptions } from "./options/connections";
import { createFiltersOptions } from "./options/filters";
import { createInputsOptions } from "./options/inputs";
import { createSceneSourcesOptions } from "./options/scene-sources";
import { createScenesOptions } from "./options/scenes";
import { plugin } from "./plugin";
import { createCurrentSceneSource } from "./sources/current-scene";
import { createIsRecordingSource } from "./sources/is-recording";
import { createIsRecordingPausedSource } from "./sources/is-recording-paused";
import { createIsStreamingSource } from "./sources/is-streaming";

const version = await readManifestVersion();

const store = new ConnectionsStore(plugin);

const connections = new ConnectionsService(
  () => publish(),
  {
    onSceneChanged: (connectionId, sceneName) => {
      plugin.emitEvent(SCENE_CHANGED_EVENT, toSceneChangedPayload(connectionId, sceneName));
    },
    onStreamStateChanged: (connectionId, active) => {
      plugin.emitEvent(
        STREAM_STATE_CHANGED_EVENT,
        toStreamStateChangedPayload(connectionId, active),
      );
    },
    onRecordStateChanged: (connectionId, active, paused) => {
      plugin.emitEvent(
        RECORD_STATE_CHANGED_EVENT,
        toRecordStateChangedPayload(connectionId, active, paused),
      );
    },
    onSourceVisibilityChanged: (connectionId, scene, source, visible) => {
      plugin.emitEvent(
        SOURCE_VISIBILITY_CHANGED_EVENT,
        toSourceVisibilityChangedPayload(connectionId, scene, source, visible),
      );
    },
    onInputMuteChanged: (connectionId, input, muted) => {
      plugin.emitEvent(
        INPUT_MUTE_CHANGED_EVENT,
        toInputMuteChangedPayload(connectionId, input, muted),
      );
    },
    onSourceFilterEnabledChanged: (connectionId, source, filter, enabled) => {
      plugin.emitEvent(
        SOURCE_FILTER_ENABLED_CHANGED_EVENT,
        toSourceFilterEnabledChangedPayload(connectionId, source, filter, enabled),
      );
    },
  },
);

plugin.registerAction(new SetSceneAction(connections));
plugin.registerAction(new StartStreamAction(connections));
plugin.registerAction(new StopStreamAction(connections));
plugin.registerAction(new StartRecordAction(connections));
plugin.registerAction(new StopRecordAction(connections));
plugin.registerAction(new PauseRecordAction(connections));
plugin.registerAction(new ResumeRecordAction(connections));
plugin.registerAction(new SetSourceVisibilityAction(connections));
plugin.registerAction(new MuteInputAction(connections));
plugin.registerAction(new UnmuteInputAction(connections));
plugin.registerAction(new SetInputVolumeAction(connections));
plugin.registerAction(new SetSourceFilterAction(connections));

plugin.registerSource(createIsStreamingSource(connections));
plugin.registerSource(createIsRecordingSource(connections));
plugin.registerSource(createIsRecordingPausedSource(connections));
plugin.registerSource(createCurrentSceneSource(connections));

plugin.registerOptions(createConnectionsOptions(store));
plugin.registerOptions(createScenesOptions(connections));
plugin.registerOptions(createInputsOptions(connections));
plugin.registerOptions(createSceneSourcesOptions(connections));
plugin.registerOptions(createFiltersOptions(connections));

function publish(): void {
  const message: PluginMessage = {
    event: "status",
    status: {
      version,
      connections: store.list().map((connection) => ({
        id: connection.id,
        name: connection.name,
        host: connection.host,
        port: connection.port,
        hasPassword: Boolean(connection.password),
        status: connections.statusOf(connection.id) ?? { status: "connecting" },
      })),
    },
  };
  plugin.sendToEditor(message);
}

function refuse(message: string): void {
  plugin.sendToEditor({ event: "connection-refused", message } satisfies PluginMessage);
}

// Attached before connecting, so nothing sent while the editor was already
// open is missed once the authenticated handshake completes.
plugin.onReceiveFromEditor((message: unknown) => {
  if (!isEditorMessage(message)) {
    return;
  }

  switch (message.event) {
    case "get-status":
      publish();
      return;

    case "create-connection": {
      const refusal = validateConnectionDraft(message.connection, store.redacted());

      if (refusal) {
        refuse(refusal);
        return;
      }

      void store.create(uuidv4(), message.connection).then(() => {
        connections.reconcile(store.list());
        publish();
      });

      return;
    }

    case "update-connection": {
      const refusal = validateConnectionDraft(message.connection, store.redacted(), message.id);

      if (refusal) {
        refuse(refusal);
        return;
      }

      void store.update(message.id, message.connection).then(() => {
        connections.reconcile(store.list());
        publish();
      });

      return;
    }

    case "delete-connection":
      void store.remove(message.id).then(() => {
        connections.reconcile(store.list());
        publish();
      });
      return;

    case "get-scenes": {
      const obs = connections.obsOf(message.connectionId);

      void (obs ? listScenes(obs) : Promise.resolve([]))
        .catch((error: unknown) => {
          console.warn("Scenes could not be listed for the editor:", error);
          return [];
        })
        .then((scenes) => {
          plugin.sendToEditor({
            event: "scenes",
            connectionId: message.connectionId,
            scenes,
          } satisfies PluginMessage);
        });

      return;
    }

    case "get-scene-sources": {
      const obs = connections.obsOf(message.connectionId);

      void (obs ? listSceneSources(obs, message.scene) : Promise.resolve([]))
        .catch((error: unknown) => {
          console.warn("Scene sources could not be listed for the editor:", error);
          return [];
        })
        .then((sources) => {
          plugin.sendToEditor({
            event: "scene-sources",
            connectionId: message.connectionId,
            scene: message.scene,
            sources,
          } satisfies PluginMessage);
        });

      return;
    }

    case "get-inputs": {
      const obs = connections.obsOf(message.connectionId);

      void (obs ? listInputs(obs) : Promise.resolve([]))
        .catch((error: unknown) => {
          console.warn("Inputs could not be listed for the editor:", error);
          return [];
        })
        .then((inputs) => {
          plugin.sendToEditor({
            event: "inputs",
            connectionId: message.connectionId,
            inputs,
          } satisfies PluginMessage);
        });

      return;
    }

    case "get-filters": {
      const obs = connections.obsOf(message.connectionId);

      void (obs ? listFilters(obs, message.source) : Promise.resolve([]))
        .catch((error: unknown) => {
          console.warn("Filters could not be listed for the editor:", error);
          return [];
        })
        .then((filters) => {
          plugin.sendToEditor({
            event: "filters",
            connectionId: message.connectionId,
            source: message.source,
            filters,
          } satisfies PluginMessage);
        });

      return;
    }
  }
});

await plugin.connect();

console.log(`OBS ${version} connected`);

// Settings are only readable over the authenticated connection, so the first
// firing — which the SDK guarantees fires immediately with what is already
// persisted — waits for it. There is no separate load step: this one
// firing doubles as startup hydration, and every later one is a live change.
await plugin.onPluginSettings<StoredSettings>((settings) => {
  const list = store.hydrate(settings);
  connections.reconcile(list);
  publish();
});
