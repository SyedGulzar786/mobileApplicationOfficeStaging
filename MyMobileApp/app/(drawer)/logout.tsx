import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LogoutScreen() {
  useEffect(() => {
    const logout = async () => {
      await AsyncStorage.removeItem('token');
    };
    logout();
  }, []);

  return <Redirect href="/" />;
}
