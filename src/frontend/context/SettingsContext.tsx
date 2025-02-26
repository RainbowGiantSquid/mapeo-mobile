import * as React from "react";
import merge from "lodash/merge";
import Bugsnag from "@bugsnag/react-native";

import createPersistedState from "../hooks/usePersistedState";

// Increment if the shape of settings changes, but try to avoid doing this
// because it will reset everybody's settings back to the defaults = bad :( It is
// not necessary to increment this if only adding new properties to the settings
// state, because we merge the default values into the persisted state.
const STORE_KEY = "@MapeoSettings@1";

export type CoordinateFormat = "utm" | "dd" | "dms";
export type ExperimentalP2pUpgrade = boolean;

export type SettingsState = {
  coordinateFormat: CoordinateFormat;
  // Experiments should only include experiments that are enabled in the app. AKA only experiments that can be turned on and off by the user
  experiments: {
    p2pUpgrade: boolean;
    directionalArrow: boolean;
    backgroundMaps: boolean;
  };
};

type SettingsContextType = [
  SettingsState,
  (key: keyof SettingsState, value: any) => void
];

const DEFAULT_SETTINGS: SettingsState = {
  coordinateFormat: "utm",
  experiments: {
    p2pUpgrade: false,
    directionalArrow: false,
    backgroundMaps: false,
  },
};

const SettingsContext = React.createContext<SettingsContextType>([
  DEFAULT_SETTINGS,
  () => {},
]);

const usePersistedState = createPersistedState(STORE_KEY);

export const SettingsProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [state, status, setState] = usePersistedState<SettingsState>(
    DEFAULT_SETTINGS
  );

  const setSettings: SettingsContextType[1] = React.useCallback(
    (key, value) => setState(previous => ({ ...previous, [key]: value })),
    [setState]
  );

  const contextValue: SettingsContextType = React.useMemo(() => {
    // If we add any new properties to the settings state, they will be
    // undefined in a users' persisted state, so we merge in the defaults
    const mergedState = merge({}, DEFAULT_SETTINGS, state);
    return [mergedState, setSettings];
  }, [state, setSettings]);

  // Track feature flags in Bugsnag
  React.useEffect(
    () => {
      for (const [key, value] of Object.entries(state.experiments)) {
        // Not tracking each value to see if it has changed, assuming that this
        // is not a costly operation to run unnecessarily
        if (value) {
          Bugsnag.addFeatureFlag(key);
        } else {
          Bugsnag.clearFeatureFlag(key);
        }
      }
    },
    // Re-run effect if any of the experiments change
    Object.values(state.experiments)
  );

  return (
    <SettingsContext.Provider value={contextValue}>
      {status === "loading" ? null : children}
    </SettingsContext.Provider>
  );
};

export default SettingsContext;
