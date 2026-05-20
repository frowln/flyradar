import 'react-native-gesture-handler';
import { View } from 'react-native';
import RootNavigator from './src/navigation/RootNavigator';
import Toast from './src/components/Toast';

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <RootNavigator />
      <Toast />
    </View>
  );
}
