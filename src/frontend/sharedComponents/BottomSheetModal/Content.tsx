import * as React from "react";
import { StyleSheet, View } from "react-native";
import { TouchableHighlight } from "@gorhom/bottom-sheet";

import { LIGHT_BLUE, MAGENTA, MAPEO_BLUE, RED, WHITE } from "../../lib/styles";
import Button from "../Button";
import Text from "../Text";

interface BaseActionButtonConfig {
  onPress: () => void;
  text: React.ReactNode;
  variation: "filled" | "outlined";
}

interface PrimaryActionButtonConfig extends BaseActionButtonConfig {
  dangerous?: boolean;
  variation: "filled";
}

interface SecondaryActionButtonConfig extends BaseActionButtonConfig {
  variation: "outlined";
}

type ActionButtonConfig =
  | PrimaryActionButtonConfig
  | SecondaryActionButtonConfig;

interface Props {
  buttonConfigs: ActionButtonConfig[];
  description?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
}

export const Content = ({ icon, buttonConfigs, description, title }: Props) => (
  <View style={styles.container}>
    <View>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <View style={styles.textContainer}>
        <Text style={[styles.title, styles.bold]}>{title}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>
    </View>
    <View style={styles.buttonsContainer}>
      {buttonConfigs.map((config, index) => (
        <Button
          fullWidth
          key={index}
          TouchableComponent={props => (
            <TouchableHighlight
              {...props}
              underlayColor={
                config.variation === "outlined"
                  ? WHITE
                  : config.dangerous
                  ? RED
                  : LIGHT_BLUE
              }
            />
          )}
          onPress={config.onPress}
          style={{
            backgroundColor:
              config.variation === "outlined"
                ? WHITE
                : config.dangerous
                ? MAGENTA
                : MAPEO_BLUE,
            marginTop: index > 0 ? 20 : undefined,
          }}
          variant={config.variation === "outlined" ? "outlined" : undefined}
        >
          <Text
            style={[
              styles.buttonText,
              styles.bold,
              {
                color: config.variation === "outlined" ? MAPEO_BLUE : WHITE,
              },
            ]}
          >
            {config.text}
          </Text>
        </Button>
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
  },
  iconContainer: {
    alignItems: "center",
  },
  textContainer: {
    marginVertical: 20,
    paddingHorizontal: 20,
  },
  title: {
    textAlign: "center",
    fontSize: 24,
  },
  description: {
    marginTop: 10,
    fontSize: 20,
    textAlign: "center",
  },
  buttonsContainer: {
    paddingHorizontal: 20,
  },
  buttonText: {
    fontSize: 18,
  },
  bold: { fontWeight: "700" },
});
