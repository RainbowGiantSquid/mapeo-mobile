import * as React from "react";
import MapboxGL from "@react-native-mapbox-gl/maps";
import ky from "ky";

import api from "../api";
import { useExperiments } from "./useExperiments";
import { normalizeStyleURL } from "../lib/mapbox";
import config from "../../config.json";

import { MapStyleContext, MapTypes } from "../context/MapStyleContext";

/** URL used for map style when no custom map and user is online */
const onlineStyleURL = MapboxGL.StyleURL.Outdoors + "?" + Date.now();

/** URL used for map style when user is not online
 * generated by [mapeo-offline-map](https://github.com/digidem/mapeo-offline-map) */
const fallbackStyleURL = "asset://offline-style.json";

type OnlineState = "unknown" | "online" | "offline";
type LegacyCustomMapState = "unknown" | "unavailable" | "available";
type SetStyleId = (id: string) => void;
type MapStyleState =
  | {
      styleUrl: null;
      styleType: Extract<MapTypes, "loading">;
      setStyleId: SetStyleId;
    }
  | {
      styleUrl: string;
      styleType: Exclude<MapTypes, "loading">;
      setStyleId: SetStyleId;
    };

function useLegacyStyle(): MapStyleState {
  const [onlineState, setOnlineState] = React.useState<OnlineState>("unknown");
  const [customMapState, setCustomMapState] = React.useState<
    LegacyCustomMapState
  >("unknown");

  React.useEffect(() => {
    let didCancel = false;

    ky.get(normalizeStyleURL(onlineStyleURL, config.mapboxAccessToken))
      .json()
      .then(() => didCancel || setOnlineState("online"))
      .catch(() => didCancel || setOnlineState("offline"));

    return () => {
      didCancel = true;
    };
  }, []);

  React.useEffect(() => {
    let didCancel = false;

    api
      .getMapStyle("default")
      .then(() => didCancel || setCustomMapState("available"))
      .catch(() => didCancel || setCustomMapState("unavailable"));

    return () => {
      didCancel = true;
    };
  }, []);

  return React.useMemo(() => {
    const setStyleId = (id: string) => {
      throw new Error("Cannot set styleId on legacy map");
    };
    if (onlineState === "unknown" || customMapState === "unknown") {
      return { styleType: "loading", styleUrl: null, setStyleId };
    } else if (customMapState === "available") {
      return {
        styleType: "custom",
        styleUrl: api.getMapStyleUrl("default"),
        setStyleId,
      };
    } else if (onlineState === "online") {
      return { styleType: "online", styleUrl: onlineStyleURL, setStyleId };
    } else {
      return { styleType: "fallback", styleUrl: fallbackStyleURL, setStyleId };
    }
  }, [onlineState, customMapState]);
}

function useMapServerStyle(): MapStyleState {
  const [styleId, setStyleId] = React.useContext(MapStyleContext);

  return React.useMemo(() => {
    if (typeof styleId !== "string") {
      // TODO: Need to figure out default style when using new map server
      return { styleType: "loading", styleUrl: null, setStyleId };
    } else {
      return {
        styleType: "mapServer",
        // TODO: When integrating I think this might be a different method?
        styleUrl: api.getMapStyleUrl(styleId),
        setStyleId,
      };
    }
  }, [styleId, setStyleId]);
}

export function useMapStyle(styleId: string = "default"): MapStyleState {
  const [{ backgroundMaps }] = useExperiments();

  const legacyStyleInfo = useLegacyStyle();
  const mapServerInfo = useMapServerStyle();

  return backgroundMaps ? mapServerInfo : legacyStyleInfo;
}
