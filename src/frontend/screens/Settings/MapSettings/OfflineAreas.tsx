import * as React from "react";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";
import { ScrollView, StyleSheet } from "react-native";
import { NavigationStackScreenComponent } from "react-navigation-stack";
import api from "../../../api";
import { useMapStyle } from "../../../hooks/useMapStyle";

import { RED } from "../../../lib/styles";
import {
  BottomSheetContent,
  BottomSheetModal,
  useBottomSheetModal,
} from "../../../sharedComponents/BottomSheetModal";
import Button from "../../../sharedComponents/Button";
import HeaderTitle from "../../../sharedComponents/HeaderTitle";
import { ErrorIcon } from "../../../sharedComponents/icons";
import Loading from "../../../sharedComponents/Loading";
import { OfflineAreaCard } from "../../../sharedComponents/OfflineAreaCard";
import { DEFAULT_MAP_ID } from "./BackgroundMaps";

const m = defineMessages({
  title: {
    id: "screens.Settings.MapSettings.OfflineArea",
    defaultMessage: "Offline Areas",
  },
  removeMap: {
    id: "screens.Settings.MapSettings.removeMap",
    defaultMessage: "Remove Map",
  },
  cancel: {
    id: "screens.Settings.MapSettings.cancel",
    defaultMessage: "Cancel",
  },
  clearDiagrams: {
    id: "screens.Settings.MapSettings.clearDiagrams",
    defaultMessage: "Are you sure you want to delete map?",
  },
  subtitle: {
    id: "screens.Settings.MapSettings.subtitle",
    defaultMessage:
      "This map and offline areas attached to it will be deleted. This cannot be undone",
  },
});

interface OfflineArea {
  id: string;
  title: string;
  zoomLevel: number;
}

export const OfflineAreas: NavigationStackScreenComponent = ({
  navigation,
}) => {
  const { formatMessage: t } = useIntl();

  const { closeSheet, openSheet, sheetRef } = useBottomSheetModal({
    openOnMount: false,
  });

  const [offlineAreaList, setOfflineAreaList] = React.useState<OfflineArea[]>();

  const { getParam } = navigation;

  const { styleId, setStyleId } = useMapStyle();

  return (
    <React.Fragment>
      {/* <ScrollView style={[styles.container]}>
        {offlineAreaList === undefined ? (
          <Loading />
        ) : (
          offlineAreaList.map((offlineArea: OfflineArea, ind) => (
            <OfflineAreaCard
              key={offlineArea.id}
              title={offlineArea.title}
              zoomLevel={offlineArea.zoomLevel}
              position={ind}
            />
          ))
        )}
      </ScrollView> */}

      <Button style={styles.button} onPress={openSheet}>
        {t(m.removeMap)}
      </Button>

      <BottomSheetModal
        disableBackrop={false}
        onDismiss={closeSheet}
        ref={sheetRef}
        onHardwareBackPress={closeSheet}
      >
        <BottomSheetContent
          buttonConfigs={[
            {
              variation: "filled",
              dangerous: true,

              onPress: async () => {
                const mapId = getParam("mapId", "");
                if (typeof mapId === "string") {
                  try {
                    await api.maps.deleteStyle(mapId);
                    if (styleId === mapId) setStyleId(DEFAULT_MAP_ID);
                  } catch (err) {
                    console.log("FAILED TO DELETE", err);
                  }
                }
              },

              text: t(m.removeMap),
            },
            {
              variation: "outlined",
              onPress: closeSheet,
              text: t(m.cancel),
            },
          ]}
          icon={
            <ErrorIcon style={{ position: "relative" }} size={90} color={RED} />
          }
          title={t(m.clearDiagrams)}
          description={t(m.subtitle)}
        />
      </BottomSheetModal>
    </React.Fragment>
  );
};

OfflineAreas.navigationOptions = {
  headerTitle: () => (
    <HeaderTitle>
      <FormattedMessage {...m.title} />
    </HeaderTitle>
  ),
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 40,
  },
  button: {
    backgroundColor: RED,
    width: 280,
    marginBottom: 20,
    marginTop: 40,
  },
});
