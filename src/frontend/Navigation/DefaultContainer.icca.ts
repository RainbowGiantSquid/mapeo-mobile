import { AppStack } from "./AppStack";
import IntroStack from "../screens/Intro";
import { createAppContainer, createSwitchNavigator } from "react-navigation";

const RootStack = createSwitchNavigator(
  {
    Intro: IntroStack,
    App: AppStack,
  },
  {
    initialRouteName: "Intro",
  }
);

export default createAppContainer(RootStack);
