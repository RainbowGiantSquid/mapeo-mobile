import "core-js/es/reflect";
import { PixelRatio } from "react-native";
import ky from "ky";
import nodejs from "nodejs-mobile-react-native";
import RNFS from "react-native-fs";
import debug from "debug";
import flatten from "flat";
import DeviceInfo from "react-native-device-info";
import { Observation } from "mapeo-schema";
import { deserializeError } from "serialize-error";
import { StyleJSON } from "@mapeo/map-server/dist/lib/stylejson";
import { TileJSON } from "@mapeo/map-server/dist/lib/tilejson";

import STATUS from "../backend/constants";
import type { ServerStartupConfig } from "../shared-types";
import { Preset, Field, Metadata, Messages } from "./context/ConfigContext";
import type { DraftPhoto } from "./context/DraftObservationContext";
import { ClientGeneratedObservation } from "./context/ObservationsContext";
import AppInfo from "./lib/AppInfo";
import promiseTimeout, { TimeoutError } from "p-timeout";
import bugsnag from "./lib/logger";
import { IconSize, ImageSize } from "./sharedTypes";
import { devExperiments } from "./lib/DevExperiments";

export type ServerStatus = keyof typeof STATUS;

export type ServerStatusMessage = {
  value: ServerStatus;
  error?: string;
  context?: string;
};
export type Subscription = { remove: () => any };

export type PeerError =
  | {
      topic: "replication-error";
      message: string;
      lastCompletedDate?: number;
    }
  | {
      topic: "replication-error";
      message: string;
      code: "ERR_VERSION_MISMATCH";
      usVersion: string;
      themVersion: string;
    }
  | {
      topic: "replication-error";
      message: string;
      code: "ERR_CLIENT_MISMATCH";
      usClient: string;
      themClient: string;
    };

export type ServerPeer = {
  id: string;
  name: string;
  // Host address for peer
  host: string;
  // Port for peer
  port: number;
  // Whether device is desktop or mobile
  deviceType: "desktop" | "mobile";
  connected: boolean;
  state?:
    | {
        topic: "replication-progress";
        message: {
          db: { sofar: number; total: number };
          media: { sofar: number; total: number };
        };
        lastCompletedDate?: number;
      }
    | {
        topic: "replication-wifi-ready";
        lastCompletedDate?: number;
      }
    | {
        topic: "replication-complete";
        // The time of completed sync in milliseconds since UNIX Epoch
        message: number;
        lastCompletedDate?: number;
      }
    | PeerError
    | {
        topic: "replication-started";
        lastCompletedDate?: number;
      };
};

type PeerHandler = (peerList: Array<ServerPeer>) => any;

// These types are manually copied from `backend/lib/types.d.ts`. This is far
// from ideal and is a workaround until we can convert the entire codebase to
// Typescript - right now frontend uses Flow.

type AvailableUpgrade = {
  hash: string;
  hashType: "sha256";
  versionName: string;
  versionCode: number;
  applicationId: string;
  minSdkVersion: number;
  // Backend code guarantees that this will be "android"
  platform: "android";
  arch: Array<"x86" | "x86_64" | "armeabi-v7a" | "arm64-v8a">;
  size: number;
  filepath: string;
};

export type TransferProgress = {
  /** id (hash) of the file being transferred */
  id: string;
  /** bytes transferred so far */
  sofar: number;
  /** total number of bytes to transfer */
  total: number;
};

// Derived from /src/backend/upgrade-manager/types.ts
type WorkingServerState = {
  value: "starting" | "started" | "stopping" | "stopped";
};
type ErrorServerState = { value: "error"; error: Error };

type UpgradeStateBase = {
  uploads: TransferProgress[];
  downloads: TransferProgress[];
  checkedPeers: string[];
  availableUpgrade?: AvailableUpgrade;
};
type UpgradeStateNoError = UpgradeStateBase & WorkingServerState;
type UpgradeStateError = UpgradeStateBase & ErrorServerState;
export type UpgradeState = UpgradeStateNoError | UpgradeStateError;
interface ApiParam {
  baseUrl: string;
  timeout?: number;
}

export { STATUS as Constants };

const log = debug("mapeo-mobile:api");

const APP_SERVER_PORT = 9081;
const APP_BASE_URL = getBaseUrl(APP_SERVER_PORT);
// Timeout between heartbeats from the server. If 10 seconds pass without a
// heartbeat then we consider the server has errored
const DEFAULT_TIMEOUT = 10000; // 10 seconds
// Timeout for server start. If 30 seconds passes after server starts with no
// heartbeat then we consider the server has errored
// This is high because in e2e testing and on very low-power devices it seems
// like startup can take a long time. TODO: Investigate slowness.
export const SERVER_START_TIMEOUT = 30000;

const pixelRatio = PixelRatio.get();

function createRequestClient({
  baseUrl,
  onReady,
}: {
  baseUrl?: string;
  onReady?: () => Promise<void>;
} = {}) {
  const req = ky.extend({
    prefixUrl: baseUrl,
    timeout: false,
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });

  return {
    get: async (url: string) => {
      if (onReady) await onReady();
      return await req.get(url).json();
    },
    del: async (url: string) => {
      if (onReady) await onReady();
      return await req.delete(url).json();
    },
    put: async (url: string, data: any) => {
      if (onReady) await onReady();
      return await req.put(url, { json: data }).json();
    },
    post: async (url: string, data: any) => {
      if (onReady) await onReady();
      return await req.post(url, { json: data }).json();
    },
  };
}

// TODO: Incorporate server status and making sure it's ready for requests?
function createMapServerApi() {
  let mapServerPort: number | undefined;
  let client: ReturnType<typeof createRequestClient> | undefined;

  // This event occurs whenever the map server's start method is called,
  // which can happen on app startup but also app resumes
  nodejs.channel.addListener(
    "map-server::start",
    (payload: { port: number }) => {
      if (mapServerPort !== payload.port) {
        mapServerPort = payload.port;
        client = createMapServerClient(mapServerPort);
      }
    }
  );

  function createMapServerClient(port: number) {
    return createRequestClient({ baseUrl: getBaseUrl(port) });
  }

  function guaranteeClient() {
    if (!mapServerPort)
      throw new Error(
        "Map server client cannot be used because port is unknown"
      );

    if (!client) {
      client = createMapServerClient(mapServerPort);
    }

    return client;
  }

  // TODO: Implement addMapServerStateListener and addMapServerErrorListener
  const mapsApi = {
    // TODO: Probably should use some kind of status-related implementation similar to how the app server does it
    ready: () => {
      // TODO: Rely on the app server's status heartbeat to ping the map server and check its state
      // This is a temporary measure since there is no server status implemented for the map server right now
      const appServerStatusSubscription = nodejs.channel.addListener(
        "status",
        ({ value }: ServerStatusMessage) => {
          if (
            value === STATUS.LISTENING ||
            value === STATUS.STARTING ||
            value === STATUS.IDLE
          ) {
            nodejs.channel.post("map-server::get-state");
          }
        }
      );

      const readyPromise = new Promise<void>(resolve => {
        const stateListenerSubscription = nodejs.channel.addListener(
          "map-server::state",
          state => {
            if (state.value === "started") {
              // @ts-expect-error
              appServerStatusSubscription.remove();
              // @ts-expect-error
              stateListenerSubscription.remove();
              resolve();
            }
          }
        );
      });

      const mapServerReadyPromise = promiseTimeout(
        readyPromise,
        DEFAULT_TIMEOUT,
        "Map server start timeout"
      );

      mapServerReadyPromise.catch(err => {
        // @ts-expect-error
        appServerStatusSubscription.remove();
        bugsnag.notify(err);
      });

      return mapServerReadyPromise as Promise<void>;
    },
    addServerStateListener: (
      handler: (state: WorkingServerState | ErrorServerState) => void
    ): Subscription => {
      const stateSubscription = nodejs.channel.addListener(
        "map-server::state",
        onState
      );

      // Poke backend to send a state event
      mapsApi
        .ready()
        .then(() => nodejs.channel.post("map-server::get-state"))
        .catch(() => {});

      function onState(serializedState: WorkingServerState | ErrorServerState) {
        handler(
          // Deserialize error if it exists
          serializedState.value === "error"
            ? {
                ...serializedState,
                error: deserializeError(serializedState.error),
              }
            : serializedState
        );
      }

      return {
        // @ts-expect-error
        remove: () => stateSubscription.remove(),
      };
    },
    addServerErrorListener: (handler: (error: Error) => void): Subscription => {
      const errorSubscription = nodejs.channel.addListener(
        "map-server::error",
        (serializedError: ErrorServerState) => {
          handler(deserializeError(serializedError));
        }
      );

      return {
        // @ts-expect-error
        remove: () => errorSubscription.remove(),
      };
    },
    createStyle: async ({
      from, // mostly for convenience to get TS inference about valid params
      ...params
    }: { accessToken?: string } & (
      | { from: "url"; url: string }
      | { from: "style"; id?: string; style: StyleJSON }
    )): Promise<{ id: string; style: StyleJSON }> =>
      (await guaranteeClient().post("styles", params)) as {
        id: string;
        style: StyleJSON;
      },
    // Delete a map style
    deleteStyle: async (id: string): Promise<void> =>
      (await guaranteeClient().del(`styles/${id}`)) as void,
    // Get a map style in the form of a style definition
    getStyle: async (id: string): Promise<StyleJSON> =>
      (await guaranteeClient().get(`styles/${id}`)) as StyleJSON,
    // Get a list of all existing styles containing scalar information about each style
    getStyleList: async (): Promise<
      { id: string; name?: string; url: string }[]
    > =>
      (await guaranteeClient().get("styles")) as {
        id: string;
        name?: string;
        url: string;
      }[],
    // Create a tileset using an existing MBTiles file
    importTileset: async (
      filePath: string
    ): Promise<TileJSON & { id: string }> =>
      (await guaranteeClient().post("tilesets/import", {
        filePath: convertFileUriToPosixPath(filePath),
      })) as TileJSON & { id: string },
    // Return the url to a map style from the map server
    getStyleUrl: (id: string): string | undefined =>
      mapServerPort ? `${getBaseUrl(mapServerPort)}styles/${id}` : undefined,
  };

  return mapsApi;
}

export function Api({ baseUrl, timeout = DEFAULT_TIMEOUT }: ApiParam) {
  let status: ServerStatus = STATUS.IDLE;
  let timeoutId: ReturnType<typeof setTimeout>;
  // We append this to requests for presets, icons and map styles, in order to
  // override the local static server cache whenever the app is restarted. NB.
  // sprite, font, and map tile requests might still be cached, only changes in
  // the map style will be cache-busted.
  let startupTime = Date.now();

  const pending: Array<{
    resolve: () => any;
    reject: (err: Error) => void;
  }> = [];
  let listeners: Array<(status: ServerStatus) => any> = [];

  nodejs.channel.addListener("status", onStatus);

  function onStatus({ value, error }: ServerStatusMessage) {
    if (status !== value) {
      bugsnag.leaveBreadcrumb("Server status change", { status: value, error });
      if (value === STATUS.ERROR) {
        bugsnag.notify(new Error(error || "Unknown Server Error"));
      }
    }
    status = value;

    if (status === STATUS.LISTENING) {
      while (pending.length) pending.shift()?.resolve();
    } else if (status === STATUS.ERROR) {
      while (pending.length)
        pending.shift()?.reject(new Error(error || "Unknown server Error"));
    } else if (status === STATUS.TIMEOUT) {
      while (pending.length)
        pending.shift()?.reject(new Error("Server Timeout"));
    }
    listeners.forEach(handler => handler(status));
    if (
      status === STATUS.LISTENING ||
      status === STATUS.STARTING ||
      status === STATUS.IDLE
    ) {
      restartTimeout();
    } else {
      clearTimeout(timeoutId);
    }
  }

  function restartTimeout() {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => onStatus({ value: STATUS.TIMEOUT }), timeout);
  }

  // Returns a promise that resolves when the server is ready to accept a
  // request and rejects if there is an error with server startup
  function onReady() {
    return new Promise<void>((resolve, reject) => {
      log("onReady called", status);
      if (status === STATUS.LISTENING) resolve();
      else if (status === STATUS.ERROR) reject(new Error("Server Error"));
      else if (status === STATUS.TIMEOUT)
        reject(new TimeoutError("Server Timeout"));
      else pending.push({ resolve, reject });
    });
  }

  // Used to track RPC communication
  let channelId = 0;

  const { del, get, post, put } = createRequestClient({ baseUrl, onReady });

  // All public methods
  const api = {
    /**
     * Map server methods
     */
    ...(devExperiments.mapSettings
      ? { maps: createMapServerApi() }
      : undefined),
    // Start server, returns a promise that resolves when the server is ready
    // or rejects if there is an error starting the server
    startServer: async () => {
      // The server might already be started - request current status
      nodejs.channel.post("request-status");
      bugsnag.leaveBreadcrumb("Starting Mapeo Core");
      const config: ServerStartupConfig = {
        sharedStorage: RNFS.ExternalDirectoryPath,
        privateCacheStorage: RNFS.CachesDirectoryPath,
        apkFilepath: AppInfo.sourceDir,
        sdkVersion: await DeviceInfo.getApiLevel(),
        supportedAbis: (await DeviceInfo.supportedAbis()) as ServerStartupConfig["supportedAbis"],
        version: DeviceInfo.getVersion(),
        buildNumber: DeviceInfo.getBuildNumber(),
        bundleId: DeviceInfo.getBundleId(),
        isDev: __DEV__,
      };
      let nodejsCommand = "loader.js";
      for (const [key, value] of Object.entries(config)) {
        nodejsCommand += ` --${key}=${value}`;
      }
      nodejs.startWithArgs(nodejsCommand);
      const serverStartPromise = new Promise<void>(resolve => {
        // nodejs-mobile-react-native channel extends React Native's EventEmitter
        //   - https://code.janeasystems.com/nodejs-mobile/react-native/bridge
        const statusSubscription = nodejs.channel.addListener("status", () => {
          // addListener returns an EventSubscription with the remove method
          //   - https://github.com/facebook/react-native/blob/v0.66.3/Libraries/vendor/emitter/_EventEmitter.js#L57
          //   - https://github.com/facebook/react-native/blob/v0.66.3/Libraries/vendor/emitter/_EventSubscription.js#L39
          // @ts-expect-error
          statusSubscription.remove();
          resolve();
        });
      }).then(async () => {
        bugsnag.leaveBreadcrumb("Mapeo Core started");
        // Start monitoring for timeout
        restartTimeout();
        // Resolve once the server reports status as "LISTENING"
        return onReady();
      });

      serverStartPromise.then(() =>
        bugsnag.leaveBreadcrumb("Mapeo Core ready")
      );

      const serverStartTimeoutPromise = promiseTimeout(
        serverStartPromise,
        SERVER_START_TIMEOUT,
        "Server start timeout"
      );

      serverStartTimeoutPromise.catch(e => {
        if (e instanceof TimeoutError) {
          if (status !== STATUS.TIMEOUT && status !== STATUS.ERROR) {
            onStatus({ value: STATUS.TIMEOUT, error: e.message });
          }
        } else {
          onStatus({ value: STATUS.ERROR, error: e.message });
        }
        bugsnag.notify(e);
      });

      return serverStartTimeoutPromise as Promise<void>;
    },

    addServerStateListener: (
      handler: (status: ServerStatus) => void
    ): Subscription => {
      listeners.push(handler);
      return {
        remove: () => (listeners = listeners.filter(h => h !== handler)),
      };
    },
    /**
     * GET async methods
     */
    getPresets: async (): Promise<Preset[]> => {
      const data = (await get(
        `presets/default/presets.json?${Date.now()}`
      )) as { presets: { [key: string]: Preset } };
      return mapToArray(data.presets);
    },
    getFields: async (): Promise<Field[]> => {
      const data = (await get(
        `presets/default/presets.json?${Date.now()}`
      )) as { fields: { [key: string]: Field } };
      return mapToArray(data.fields);
    },

    getMetadata: async (): Promise<Metadata> => {
      const data = await get(`presets/default/metadata.json?${Date.now()}`);
      return (data || {}) as Metadata;
    },

    getConfigMessages: async (locale: string = "en"): Promise<Messages> => {
      const data = await get(`presets/default/translations.json?${Date.now()}`);
      // @ts-ignore
      const messages = data && data[locale];
      if (!messages) return {};
      return flatten(messages);
    },

    getObservations: async (): Promise<Observation[]> => {
      const data = (await get("observations")) as Observation[];
      return data;
    },

    getMapStyle: (id: string): Promise<any> => {
      return get(`styles/${id}/style.json?${startupTime}`);
    },

    getDeviceId: (): Promise<string> => {
      return get(`device/id`) as Promise<string>;
    },

    getServerStatus: (): ServerStatus => {
      return status;
    },

    /**
     * DELETE methods
     */

    deleteObservation: (id: string): Promise<{ deleted: boolean }> => {
      return del(`observations/${id}`) as Promise<{ deleted: boolean }>;
    },

    /**
     * PUT and POST methods
     */

    savePhoto: ({
      originalUri,
      previewUri,
      thumbnailUri,
    }: DraftPhoto): Promise<{ id: string }> => {
      if (!originalUri || !previewUri || !thumbnailUri)
        return Promise.reject(
          new Error("Missing uri for full image or thumbnail to save to server")
        );
      const data = {
        original: convertFileUriToPosixPath(originalUri),
        preview: convertFileUriToPosixPath(previewUri),
        thumbnail: convertFileUriToPosixPath(thumbnailUri),
      };
      const createPromise = post("media", data) as Promise<{ id: string }>;
      // After images have saved to the server we can delete the versions in
      // local cache to avoid filling up space on the phone
      const localFiles = Object.values(data);
      createPromise
        .then(_ => Promise.all(localFiles.map(path => RNFS.unlink(path))))
        .then(() => log("Deleted temp photos on save", localFiles))
        .catch(err => log("Error deleting local image file", err));
      return createPromise;
    },

    updateObservation: async (
      id: string,
      value: ClientGeneratedObservation,
      options: {
        links: Array<string>;
        userId?: Observation["userId"];
      }
    ): Promise<Observation> => {
      const valueForServer = {
        ...value,
        // work around for a quirk in the api right now, we should probably change
        // this to accept a links array. An array is needed if you want to merge
        // existing forks
        version: options.links[0],
        userId: options.userId,
        type: "observation",
        schemaVersion: 3,
        id,
      };

      const serverObservation = (await put(
        `observations/${id}`,
        valueForServer
      )) as Observation;

      return serverObservation;
    },

    createObservation: async (
      value: ClientGeneratedObservation
    ): Promise<Observation> => {
      const valueForServer = {
        ...value,
        type: "observation",
        schemaVersion: 3,
      };

      const serverObservation = (await post(
        "observations",
        valueForServer
      )) as Observation;

      return serverObservation;
    },

    // Replaces app config with .mapeosettings tar file at `path`
    replaceConfig: async (fileUri: string): Promise<void> => {
      const path = convertFileUriToPosixPath(fileUri);
      await onReady();
      return await new Promise((resolve, reject) => {
        const id = channelId++;
        const replaceConfigIdSubscription = nodejs.channel.addListener(
          "replace-config-" + id,
          err => {
            // See comment in startServer
            // @ts-expect-error
            replaceConfigIdSubscription.remove();
            done(err);
          }
        );
        nodejs.channel.post("replace-config", { path, id });

        const timeoutId = setTimeout(() => {
          // See comment in startServer
          // @ts-expect-error
          replaceConfigIdSubscription.remove();
          done(new Error("Timeout when replacing config"));
        }, 30 * 1000);

        function done(err: Error) {
          clearTimeout(timeoutId);
          if (err) return reject(err);
          // startupTime is use for cache-busting. When we replace the
          // config we want the cache to be reset so that icons with the
          // same name are not cached
          startupTime = Date.now();
          resolve();
        }
      });
    },

    /**
     * P2P Upgrade methods
     */
    // Listen for updates to p2p upgrade state
    addP2pUpgradeStateListener: (
      handler: (state: UpgradeState) => void
    ): Subscription => {
      const stateSubscription = nodejs.channel.addListener(
        "p2p-upgrade::state",
        onState
      );
      // Poke backend to send a state event
      onReady()
        .then(() => nodejs.channel.post("p2p-upgrade::get-state"))
        .catch(() => {});
      // Deserialize error
      function onState(stateSerializedError: UpgradeStateError) {
        handler({
          ...stateSerializedError,
          error:
            stateSerializedError.error &&
            deserializeError(stateSerializedError.error),
        });
      }
      return {
        // See comment in startServer
        // @ts-expect-error
        remove: () => stateSubscription.remove(),
      };
    },
    addP2pUpgradeErrorListener: (
      handler: (error: Error) => void
    ): Subscription => {
      const errorSubscription = nodejs.channel.addListener(
        "p2p-upgrade::error",
        onError
      );
      function onError(serializedError: UpgradeStateError) {
        handler(deserializeError(serializedError));
      }
      return {
        // See comment in startServer
        // @ts-expect-error
        remove: () => errorSubscription.remove(),
      };
    },
    startP2pUpgradeServices: async () => {
      try {
        await onReady();
        nodejs.channel.post("p2p-upgrade::start-services");
      } catch {
        // noop
      }
    },
    stopP2pUpgradeServices: () => {
      nodejs.channel.post("p2p-upgrade::stop-services");
    },

    /**
     * SYNC methods
     */

    // Listens to the server for updates to the list of peers available for sync
    // returns a remove() function to unscubribe
    addPeerListener: (handler: PeerHandler): Subscription => {
      // We sidestep the http API here, and instead of polling the endpoint, we
      // listen for an event from mapeo-core whenever the peers change, then
      // request an updated peer list.
      const peerUpdateSubscription = nodejs.channel.addListener(
        "peer-update",
        handler
      );
      api.syncGetPeers().then(handler);
      return {
        // See comment in startServer
        // @ts-expect-error
        remove: () => peerUpdateSubscription.remove(),
      };
    },

    // Start listening for sync peers and advertise with `deviceName`
    syncJoin: async (deviceName: string) => {
      await onReady();
      return nodejs.channel.post("sync-join", { deviceName });
    },

    // Stop listening for sync peers and stop advertising
    syncLeave: async () => {
      await onReady();
      return nodejs.channel.post("sync-leave");
    },

    // Get a list of discovered sync peers
    syncGetPeers: async () => {
      const data = await get("sync/peers");
      return data && (data as { message: any }).message;
    },

    // Start sync with a peer
    syncStart: async (target: { host: string; port: number }) => {
      await onReady();
      return nodejs.channel.post("sync-start", target);
    },
    /**
     * HELPER synchronous methods
     */

    // Return the url for an icon
    getIconUrl: (iconId: string, size: IconSize = "medium"): string => {
      // Some devices are @4x or above, but we only generate icons up to @3x
      // Also we don't have @1.5x, so we round it up
      const roundedRatio = Math.min(Math.ceil(pixelRatio), 3);
      return `${APP_BASE_URL}presets/default/icons/${iconId}-medium@${roundedRatio}x.png?${startupTime}`;
    },

    // Return the url for a media attachment
    getMediaUrl: (attachmentId: string, size: ImageSize): string => {
      return `${APP_BASE_URL}media/${size}/${attachmentId}`;
    },

    // Return the File Uri for a media attachment in local storage. Necessary
    // for sharing media with other apps.
    // **WARNING**: This depends on internal implementation of the media blob
    // store and will break if that changes. I apologise if you reach here after
    // some lengthy debugging.
    getMediaFileUri: (attachmentId: string, size: ImageSize): string => {
      const dir = RNFS.DocumentDirectoryPath;
      return `file://${dir}/media/${size}/${attachmentId.slice(
        0,
        2
      )}/${attachmentId}`;
    },

    // Return the url to a map style
    getMapStyleUrl: (id: string): string => {
      return `${APP_BASE_URL}styles/${id}/style.json?${startupTime}`;
    },
  };

  return api;
}

export default Api({ baseUrl: APP_BASE_URL });

function getBaseUrl(port: number) {
  return `http://127.0.0.1:${port}/`;
}

function mapToArray<T>(map: { [key: string]: T }): Array<T> {
  return Object.keys(map).map(id => ({
    ...map[id],
    id,
  }));
}

function convertFileUriToPosixPath(fileUri: unknown) {
  if (typeof fileUri !== "string")
    throw new Error("Attempted to convert invalid file Uri:" + fileUri);
  return fileUri.replace(/^file:\/\//, "");
}
