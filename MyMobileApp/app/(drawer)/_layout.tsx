// import { Tabs } from 'expo-router';
// import React from 'react';
// import { Platform } from 'react-native';

// import { HapticTab } from '@/components/HapticTab';
// import { IconSymbol } from '@/components/ui/IconSymbol';
// import TabBarBackground from '@/components/ui/TabBarBackground';
// import { Colors } from '@/constants/Colors';
// import { useColorScheme } from '@/hooks/useColorScheme';

// export default function TabLayout() {
//   const colorScheme = useColorScheme();

//   return (
//     <Tabs
//       screenOptions={{
//         tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
//         headerShown: false,
//         tabBarButton: HapticTab,
//         tabBarBackground: TabBarBackground,
//         tabBarStyle: Platform.select({
//           ios: {
//             // Use a transparent background on iOS to show the blur effect
//             position: 'absolute',
//           },
//           default: {},
//         }),
//       }}>
//       <Tabs.Screen
//         name="index"
//         options={{
//           title: 'Home',
//           tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
//         }}
//       />
//       <Tabs.Screen
//         name="explore"
//         options={{
//           title: 'Explore',
//           tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
//         }}
//       />
//     </Tabs>
//   );
// }


// import React, { useEffect, useState } from 'react';
// import { Drawer } from 'expo-router/drawer';
// import { Redirect } from 'expo-router';
// import AsyncStorage from '@react-native-async-storage/async-storage';

// export default function DrawerLayout() {
//   const [isLoggedIn, setIsLoggedIn] = useState(false);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     const checkLogin = async () => {
//       const token = await AsyncStorage.getItem('token');
//       setIsLoggedIn(!!token);
//       setLoading(false);
//     };
//     checkLogin();
//   }, []);

//   if (loading) return null;

//   if (!isLoggedIn) {
//     return <Redirect href="/" />;
//   }

//   return (
//     <Drawer>
//       <Drawer.Screen name="index" options={{ drawerLabel: '🏠 Home' }} />
//       <Drawer.Screen name="records" options={{ drawerLabel: '📅 Attendance History' }} />
//       <Drawer.Screen name="logout" options={{ drawerLabel: '🚪 Logout' }} />
//     </Drawer>
//   );
// }




import { DrawerToggleButton } from '@react-navigation/drawer';
import React, { useState } from 'react';
import { Drawer } from 'expo-router/drawer';
import {
  View,
  Text,
  TextInput,
  Button,
  ScrollView,
  Alert,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext'; // ✅ Update path if needed

const API = 'http://192.168.100.174:5000';

export default function DrawerLayout() {
  const {
    isLoggedIn,
    isAuthReady,
    login: authLogin,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isReset, setIsReset] = useState(false);
  const [resetName, setResetName] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');

  const login = async () => {
    try {
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        Alert.alert('Error', 'Unexpected server response');
        return;
      }

      if (!res.ok) {
        Alert.alert('Login Failed', data.message || 'Check credentials');
        return;
      }

      await authLogin(data.token); // ✅ Call context login
    } catch {
      Alert.alert('Error', 'Login failed');
    }
  };

  const resetPassword = async () => {
    if (!resetEmail || !newResetPassword || !resetName) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    if (newResetPassword !== confirmResetPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    try {
      const res = await fetch(`${API}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: resetName,
          email: resetEmail,
          newPassword: newResetPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.message || 'Reset failed');
        return;
      }

      Alert.alert('Success', data.message || 'Password reset successful');
      setIsReset(false);
      setEmail('');
      setPassword('');
    } catch {
      Alert.alert('Error', 'Something went wrong');
    }
  };

  if (!isAuthReady) return null; // ✅ Wait for auth to load

  if (!isLoggedIn) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>{isReset ? 'Reset Password' : 'Login'}</Text>

          <TextInput
            placeholder="Email"
            value={isReset ? resetEmail : email}
            onChangeText={text => (isReset ? setResetEmail(text) : setEmail(text))}
            style={styles.input}
          />

          {!isReset ? (
            <View style={styles.passwordContainer}>
              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color="gray" />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                placeholder="Name"
                value={resetName}
                onChangeText={setResetName}
                style={styles.input}
              />
              <TextInput
                placeholder="New Password"
                value={newResetPassword}
                onChangeText={setNewResetPassword}
                style={styles.input}
                secureTextEntry
              />
              <TextInput
                placeholder="Confirm Password"
                value={confirmResetPassword}
                onChangeText={setConfirmResetPassword}
                style={styles.input}
                secureTextEntry
              />
            </>
          )}

          {isReset ? (
            <>
              <Button title="Reset Password" onPress={resetPassword} />
              <Text style={styles.linkText} onPress={() => setIsReset(false)}>
                Back to Login
              </Text>
            </>
          ) : (
            <>
              <Button title="Login" onPress={login} />
              <Text style={styles.linkText} onPress={() => setIsReset(true)}>
                Forgot Password?
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <Drawer screenOptions={{
      headerLeft: () => <DrawerToggleButton />,
      headerTitle: '',
    }}
    >
      <Drawer.Screen name="index" options={{ drawerLabel: '🏠 Home' }} />
      <Drawer.Screen name="records" options={{ drawerLabel: '📅 Attendance History' }} />
      <Drawer.Screen name="logout" options={{ drawerLabel: '🚪 Logout' }} />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, flexGrow: 1, alignItems: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
  },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  input: {
    borderWidth: 1,
    width: '100%',
    padding: 10,
    marginBottom: 10,
    borderRadius: 5,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    width: '100%',
    paddingRight: 10,
    marginBottom: 10,
    borderRadius: 5,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginRight: 10,
  },
  linkText: { color: 'blue', marginTop: 10, textAlign: 'center' },
});
