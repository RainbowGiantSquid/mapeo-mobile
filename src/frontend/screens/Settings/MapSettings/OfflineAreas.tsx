import * as React from "react";
import { defineMessages, useIntl } from "react-intl";
import { ScrollView, StyleSheet } from "react-native";
import { useSetHeader } from "../../../hooks/useSetHeader";

import { RED } from "../../../lib/styles";
import {
  BottomSheetContent,
  BottomSheetModal,
  useBottomSheetModal,
} from "../../../sharedComponents/BottomSheetModal";
import Button from "../../../sharedComponents/Button";
import { ErrorIcon } from "../../../sharedComponents/icons";
import Loading from "../../../sharedComponents/Loading";
import { OfflineAreaCard } from "../../../sharedComponents/OfflineAreaCard";
import { NativeNavigationProp } from "../../../sharedTypes";

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
    defaultMessage: "Are you sure you want to clear diagrams?",
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

export const OfflineAreas = ({
  route,
}: NativeNavigationProp<"OfflineAreas">) => {
  const bgMapId = React.useRef("");
  const { formatMessage: t } = useIntl();

  useSetHeader({ headerTitle: m.title });

  const { closeSheet, openSheet, sheetRef } = useBottomSheetModal({
    openOnMount: false,
  });

  const [offlineAreaList, setOfflineAreaList] = React.useState<OfflineArea[]>();

  React.useEffect(() => {
    bgMapId.current = route.params.mapId;

    // To Do Api call to get offline areas
    function getAllOfflineAreas(mapId: string): OfflineArea[] {
      return [
        {
          id: "1",
          title: "Offline Area 1",
          zoomLevel: 12,
        },
        {
          id: "2",
          title: "Offline Area 2",
          zoomLevel: 7,
        },
      ];
    }

    setOfflineAreaList(getAllOfflineAreas(bgMapId.current));
  }, [route.params.mapId]);

  return (
    <React.Fragment>
      <ScrollView style={[styles.container]}>
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
      </ScrollView>

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
              // To do API call to delete map
              onPress: () => {
                closeSheet();
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

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 40,
  },
  button: {
    backgroundColor: RED,
    width: 280,
    marginBottom: 20,
  },
});
