// @flow
import React from "react";
import { View, StyleSheet } from "react-native";

import IconButton from "../../sharedComponents/IconButton";
import { useObservation } from "../../hooks/useObservation";
import { useDraftObservation } from "../../hooks/useDraftObservation";

import { EditIcon } from "../../sharedComponents/icons";
import useDeviceId from "../../hooks/useDeviceId";
import { SyncIcon } from "../../sharedComponents/icons/SyncIconCircle";
import { useNavigation } from "../../hooks/useNavigationWithTypes";

const ObservationHeaderRight = ({ observationId }) => {
  const [{ observation }] = useObservation(observationId);
  const deviceId = useDeviceId();
  const [, { newDraft }] = useDraftObservation();
  const navigation = useNavigation();

  function handlePress() {
    if (!observation) return;
    newDraft(observation.id, observation);
    navigation.navigate("ObservationEdit", { observationId });
  }

  // Don't render the button if observation doesn't exist
  if (!observation) return null;
  const isMine = observation.deviceId === deviceId;
  return isMine ? (
    <IconButton onPress={handlePress} testID="editButton">
      <EditIcon />
    </IconButton>
  ) : (
    <View style={styles.syncIconContainer}>
      <SyncIcon color="#3C69F6" />
    </View>
  );
};

export default ObservationHeaderRight;

const styles = StyleSheet.create({
  syncIconContainer: {
    width: 60,
    height: 60,
    flex: 0,
    justifyContent: "center",
    alignItems: "center",
  },
});
