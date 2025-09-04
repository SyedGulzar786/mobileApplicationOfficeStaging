// import { useEffect } from 'react';
// import { Redirect } from 'expo-router';
// import AsyncStorage from '@react-native-async-storage/async-storage';

// export default function LogoutScreen() {
//   useEffect(() => {
//     const logout = async () => {
//       await AsyncStorage.removeItem('token');
//     };
//     logout();
//   }, []);

//   return <Redirect href="/" />;
// }


// app/(drawer)/logout.tsx

import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

export default function LogoutScreen() {
  const { logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const doLogout = async () => {
      await logout();
      router.replace('/'); // Push to home/login
    };
    doLogout();
  }, []);

  return null;
}
