import React from "react";
import { useState } from "react";
import { defineMessages, FormattedMessage } from "react-intl";
import { NavigationStackScreenComponent } from "react-navigation-stack";

import { LeaveProjectCompleted } from "./LeaveProjectCompleted";
import { LeaveProjectInitial } from "./LeaveProjectInitial";
import { LeaveProjectProgress } from "./LeaveProjectProgess";
import HeaderTitle from "../../sharedComponents/HeaderTitle";

const m = defineMessages({
  headerTitle: {
    id: "screens.LeaveProject.LeaveProject",
    defaultMessage: "Leave Project",
  },
});

enum ScreenStates {
  initial,
  progress,
  completed,
}

export interface LeaveProjSharedProp {
  next: () => void;
}

export const LeaveProjectScreen: NavigationStackScreenComponent = () => {
  const { initial, progress } = ScreenStates;
  const [screen, setScreen] = useState(initial);

  function nextScreenState() {
    setScreen(previousScreen => previousScreen + 1);
  }

  if (screen === initial) {
    return <LeaveProjectInitial next={nextScreenState} />;
  }

  if (screen === progress) {
    return <LeaveProjectProgress next={nextScreenState} />;
  }

  return <LeaveProjectCompleted />;
};

LeaveProjectScreen.navigationOptions = {
  headerTitle: () => (
    <HeaderTitle style={{}}>
      <FormattedMessage {...m.headerTitle} />
    </HeaderTitle>
  ),
};
