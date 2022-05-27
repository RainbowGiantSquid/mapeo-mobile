import * as React from "react";
import * as DocumentPicker from "expo-document-picker";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { NavigationStackScreenComponent } from "react-navigation-stack";
import { LIGHT_GREY, MEDIUM_GREY, RED } from "../../../lib/styles";
import { BGMapCard } from "../../../sharedComponents/BGMapCard";
import BottomSheet, { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import Button from "../../../sharedComponents/Button";
import HeaderTitle from "../../../sharedComponents/HeaderTitle";
import Loading from "../../../sharedComponents/Loading";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import MaterialIcon from "react-native-vector-icons/MaterialIcons";
import { TouchableOpacity } from "../../../sharedComponents/Touchables";
import api from "../../../api";
import { useMapStyle } from "../../../hooks/useMapStyle";

export const DEFAULT_MAP_ID = "default";

const m = defineMessages({
  addBGMap: {
    id: "screens.Settings.MapSettings.BackgroundMaps",
    defaultMessage: "Add Background Map",
  },
  close: {
    id: "screens.Settings.MapSettings.close",
    defaultMessage: "Close",
  },
  importFromFile: {
    id: "screens.Settings.MapSettings.importFromFile",
    defaultMessage: "Import from File",
  },
  BackgroundMapTitle: {
    id: "screens.Settings.MapSettings.BackgroundMapTitle",
    defaultMessage: "Background Maps",
  },
  noAreas: {
    id: "screens.Settings.MapSettings.noAreas",
    defaultMessage: "No Downloaded Offline Area",
    description:
      "Message to indicate to user that no offline areas have been downloaded",
  },
  deleteMapTitle: {
    id: "screens.Settings.MapSettings.deleteMapTitle",
    defaultMessage: "Delete Map",
    description: "Title for the delete map modal",
  },
  confirmDelete: {
    id: "screens.Settings.MapSettings.confirmDelete",
    defaultMessage: "Yes, Delete",
    description: "Confirm delete map modal button",
  },
});

interface BackgroundMap {
  id: string;
  name?: string;
  url: string;
}

export const BackgroundMaps: NavigationStackScreenComponent = ({
  navigation,
}) => {
  const sheetRef = React.useRef<BottomSheetMethods>(null);

  const { styleUrl, defaultStyleUrl } = useMapStyle();

  const [snapPoints, setSnapPoints] = React.useState<(number | string)[]>([
    0,
    "30%",
  ]);

  const [backgroundMapList, setBackgroundMapList] = React.useState<
    BackgroundMap[]
  >();

  React.useEffect(() => {
    api.maps
      .getStyleList()
      .then(list => setBackgroundMapList(list))
      .catch(() => {
        console.log("COULD NOT FETCH STYLES");
      });
  }, []);

  const { formatMessage: t } = useIntl();

  function openModal() {
    sheetRef.current?.snapTo(1);
  }

  async function handleImportPress() {
    const results = await DocumentPicker.getDocumentAsync();

    if (results.type === "cancel") {
      sheetRef.current?.close();
      return;
    }

    if (results.type === "success") {
      // To do API call to import map

      api.maps
        .importTileset(results.uri)
        .then(() => {
          api.maps.getStyleList().then(list => setBackgroundMapList(list));
        })
        .catch(err => {
          console.log("FAILED TO IMPORT", err);
        })
        .finally(() => {
          sheetRef.current?.close();
        });
    }
  }

  return (
    <React.Fragment>
      <ScrollView style={styles.container}>
        <Button style={[styles.button]} variant="outlined" onPress={openModal}>
          {t(m.addBGMap)}
        </Button>

        {/* Default BG map card */}
        {defaultStyleUrl && (
          <BGMapCard
            mapId={DEFAULT_MAP_ID}
            style={{ marginTop: 20 }}
            onPress={() => {}}
            navigation={navigation}
            isSelected={styleUrl === defaultStyleUrl}
            styleUrl={defaultStyleUrl}
            mapTitle="Default Map"
          />
        )}

        {backgroundMapList === undefined ? (
          <View style={{ marginTop: 40 }}>
            <Loading />
          </View>
        ) : backgroundMapList.length === 0 ? (
          <Text style={styles.noDownloads}>
            <FormattedMessage {...m.noAreas} />
          </Text>
        ) : (
          backgroundMapList.map(bgMap => (
            <BGMapCard
              key={bgMap.id}
              mapId={bgMap.id}
              style={{ marginTop: 20 }}
              styleUrl={bgMap.url}
              isSelected={styleUrl === bgMap.url}
              navigation={navigation}
              mapTitle={bgMap.name}
            />
          ))
        )}
      </ScrollView>

      <BottomSheet
        snapPoints={snapPoints}
        ref={sheetRef}
        backdropComponent={BottomSheetBackdrop}
        handleComponent={() => null}
      >
        <View
          onLayout={e => {
            const { height } = e.nativeEvent.layout;
            setSnapPoints([0, height]);
          }}
          style={{ padding: 20 }}
        >
          <HeaderTitle style={{ textAlign: "center", marginTop: 20 }}>
            {t(m.BackgroundMapTitle)}
          </HeaderTitle>

          <TouchableOpacity
            onPress={handleImportPress}
            style={styles.importButton}
          >
            <React.Fragment>
              <View style={styles.importTextAndIcon}>
                <MaterialIcon
                  name="file-upload"
                  size={30}
                  color={MEDIUM_GREY}
                />
                <Text style={styles.text}> {t(m.importFromFile)}</Text>
              </View>
              <Text style={[styles.text, { textAlign: "center" }]}>
                {"( .mbtiles )"}
              </Text>
            </React.Fragment>
          </TouchableOpacity>

          <Button
            fullWidth
            variant="outlined"
            onPress={() => sheetRef.current?.close()}
          >
            {t(m.close)}
          </Button>
        </View>
      </BottomSheet>
    </React.Fragment>
  );
};

BackgroundMaps.navigationOptions = {
  headerTitle: () => (
    <HeaderTitle>
      <FormattedMessage {...m.BackgroundMapTitle} />
    </HeaderTitle>
  ),
};

const styles = StyleSheet.create({
  button: {
    marginTop: 40,
    width: 280,
  },
  noDownloads: {
    fontSize: 16,
    color: MEDIUM_GREY,
    textAlign: "center",
    marginTop: 20,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  importButton: {
    backgroundColor: LIGHT_GREY,
    padding: 40,
    marginTop: 20,
    marginBottom: 20,
    borderRadius: 5,
  },
  text: {
    fontSize: 16,
  },
  importTextAndIcon: {
    marginBottom: 20,
    display: "flex",
    justifyContent: "center",
    flexDirection: "row",
  },
});
