/**
 * Only reachable if the `onboarding` experiment is enabled
 * by doing either of the following:
 *   - Set `FEATURE_ONBOARDING=true` when running/building
 *   - Manually change the context value in `SettingsContext.tsx`
 */
import * as React from "react";
import { Share, StyleSheet, View } from "react-native";
import { FormattedMessage, defineMessages } from "react-intl";
import {
  NavigationStackScreenComponent,
  TransitionPresets,
} from "react-navigation-stack";

import { MEDIUM_BLUE, WHITE } from "../../lib/styles";
import HeaderTitle from "../../sharedComponents/HeaderTitle";
import { BackIcon } from "../../sharedComponents/icons";
import Button from "../../sharedComponents/Button";
import IconButton from "../../sharedComponents/IconButton";
import Text from "../../sharedComponents/Text";
import { URI_PREFIX } from "../../constants";
import { WithWifiBar } from "./WithWifiBar";

const m = defineMessages({
  title: {
    id: "screens.Onboarding.SendJoinRequestScreen.title",
    defaultMessage: "Send Join Request",
  },
  verificationCode: {
    id: "screens.Onboarding.SendJoinRequestScreen.verificationCode",
    defaultMessage: "Verification Code",
  },
  instructions: {
    id: "screens.Onboarding.SendJoinRequestScreen.instructions",
    defaultMessage: "Share this code with the Project Coordinator",
  },
  share: {
    id: "screens.Onboarding.SendJoinRequestScreen.share",
    defaultMessage: "Share",
  },
});

export const SendJoinRequestScreen: NavigationStackScreenComponent = () => {
  // TOOD: Need to properly generate
  const verificationCode = Math.random().toString().slice(-5);

  // TODO: Decide on a URL structure for this deep link
  const shareLink = `${URI_PREFIX}main/onboarding?code=${verificationCode}`;

  return (
    <WithWifiBar>
      <View style={styles.container}>
        <View>
          <Text style={styles.verificationCodeTitle}>
            <FormattedMessage {...m.verificationCode} />
          </Text>
          <Text style={styles.verificationCode}>{verificationCode}</Text>
          <Text style={styles.instructions}>
            <FormattedMessage {...m.instructions} />
          </Text>
        </View>
        <Button
          onPress={() => Share.share({ message: shareLink, url: shareLink })}
        >
          <Text style={styles.shareButton}>
            <FormattedMessage {...m.share} />
          </Text>
        </Button>
      </View>
    </WithWifiBar>
  );
};

SendJoinRequestScreen.navigationOptions = () => ({
  ...TransitionPresets.SlideFromRightIOS,
  headerTitle: () => (
    <HeaderTitle style={{ color: WHITE }}>
      <FormattedMessage {...m.title} />
    </HeaderTitle>
  ),
  headerLeft: ({ onPress }) =>
    onPress && (
      <IconButton onPress={onPress}>
        <BackIcon color={WHITE} />
      </IconButton>
    ),
  headerStyle: {
    backgroundColor: MEDIUM_BLUE,
  },
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "space-between",
    flex: 1,
    padding: 40,
  },
  verificationCodeTitle: {
    fontSize: 30,
    textAlign: "center",
    fontWeight: "700",
  },
  verificationCode: {
    fontWeight: "700",
    textAlign: "center",
    fontSize: 40,
    marginVertical: 24,
  },
  instructions: { textAlign: "center", fontSize: 24 },
  shareButton: {
    color: WHITE,
    fontWeight: "700",
    fontSize: 16,
    paddingHorizontal: 40,
  },
});
