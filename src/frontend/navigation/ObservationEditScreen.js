import React from "react";
import { Text, TouchableHighlight } from "react-native";

import CenteredView from "../components/CenteredView";
import Thumbnail from "../components/Thumbnail";

class ObservationEditScreen extends React.Component {
  render() {
    const { navigation } = this.props;
    return (
      <CenteredView>
        <TouchableHighlight
          onPress={() => navigation.push("ObservationCategories")}
        >
          <Text style={{ padding: 50, backgroundColor: "#cccccc" }}>
            Navigate
          </Text>
        </TouchableHighlight>
      </CenteredView>
    );
  }
}

ObservationEditScreen.navigationOptions = {
  title: "Edit"
};

export default ObservationEditScreen;
