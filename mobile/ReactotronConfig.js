import Reactotron from 'reactotron-react-native'
import { reactotronRedux } from 'reactotron-redux'
import AsyncStorage from '@react-native-async-storage/async-storage'

if (__DEV__) {
  Reactotron
    .setAsyncStorageHandler(AsyncStorage)
    .configure({
      name: 'Fine Print AI Mobile'
    })
    .useReactNative({
      asyncStorage: false, // there are more options to the async storage.
      networking: {
        ignoreUrls: /symbolicate/
      },
      editor: false,
      errors: { veto: stackFrame => false },
      overlay: false,
    })
    .use(reactotronRedux())
    .connect()

  // Clear the console on each app load
  Reactotron.clear()

  console.tron = Reactotron
}

export default Reactotron