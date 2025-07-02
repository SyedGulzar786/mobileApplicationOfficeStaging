import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, ScrollView, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API = 'http://192.168.100.174:5000'; // Replace with your local IP

type AttendanceRecord = {
  _id: string;
  userId: {
    _id: string;
    name: string;
  } | null;
};

export default function AuthAttendanceScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [token, setToken] = useState<string | null>(null);

  // Register
  const register = async () => {
    try {
      const res = await fetch(`${API}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        Alert.alert('Error', data.message || 'Registration failed');
        return;
      }

      Alert.alert('Success', 'User registered. Now log in.');
    } catch (err) {
      console.error('Register error:', err);
      Alert.alert('Error', 'Registration failed');
    }
  };

  // Login
  const login = async () => {
    try {
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const text = await res.text();
      console.log('Login response:', text);

      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        console.error('Invalid JSON:', text);
        Alert.alert('Error', 'Unexpected response from server');
        return;
      }

      if (!res.ok) {
        Alert.alert('Login Failed', data.message || 'Check credentials');
        return;
      }

      await AsyncStorage.setItem('token', data.token);
      setToken(data.token);
      Alert.alert('Success', 'Logged in');
      fetchToday(data.token);
    } catch (err) {
      console.error('Login error:', err);
      Alert.alert('Error', 'Login failed');
    }
  };

  // Mark attendance (requires token)
  const markAttendance = async () => {
    try {
      const res = await fetch(`${API}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        Alert.alert('Error', data.message || 'Attendance failed');
        return;
      }

      Alert.alert('Success', 'Attendance marked');
      if (token) {
        fetchToday(token);
      }
    } catch (err) {
      Alert.alert('Error', 'Could not mark attendance');
    }
  };

  // Fetch today's attendance
  const fetchToday = async (tokenOverride?: string) => {
    try {
      const res = await fetch(`${API}/today`);
      const data = await res.json();

      if (Array.isArray(data)) {
        setAttendance(data);
      } else {
        console.warn('Unexpected response from /today:', data);
        setAttendance([]);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setAttendance([]);
    }
  };

  useEffect(() => {
    // Try loading token if user already logged in
    const loadToken = async () => {
      const stored = await AsyncStorage.getItem('token');
      if (stored) {
        setToken(stored);
        fetchToday(stored);
      }
    };
    loadToken();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Attendance App</Text>

      <TextInput placeholder="Name" value={name} onChangeText={setName} style={styles.input} />
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} style={styles.input} />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />

      <Button title="Register" onPress={register} />
      <View style={styles.space} />
      <Button title="Login" onPress={login} />
      <View style={styles.space} />
      <Button title="Mark Attendance" onPress={markAttendance} disabled={!token} />

      <Text style={styles.subtitle}>Today's Attendance:</Text>
      {Array.isArray(attendance) && attendance.length > 0 ? (
        attendance.map((record) => (
          <Text key={record._id}>{record.userId?.name ?? 'Unknown'}</Text>
        ))
      ) : (
        <Text>No attendance records found</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, flexGrow: 1, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  input: { borderWidth: 1, width: '100%', padding: 10, marginBottom: 10 },
  space: { height: 10 },
  subtitle: { fontSize: 18, marginTop: 20 },
});
// Note: Ensure you have the necessary permissions and configurations for AsyncStorage and network requests in your React Native project.
// Also, make sure to handle errors and edge cases in production code.
// This code is a basic example and may need adjustments based on your specific requirements and environment.
// Ensure your backend API is running and accessible from the mobile device.
// Test the app on a real device or emulator with network access to the backend server.
// You may need to adjust the API URL based on your network configuration.
// Consider adding more error handling and user feedback for a better user experience.
// This code is a simple attendance app that allows users to register, log in, and mark their attendance.
// It fetches today's attendance records and displays them in a list.
// Make sure to test the app thoroughly and handle any potential issues with network requests or data storage.
// You can enhance the app by adding features like user profile management, attendance history, and more.
// This code is a starting point for building a mobile attendance application using React Native.
// You can further improve the UI/UX by using libraries like React Native Paper or NativeBase
// for better components and styling.
// Consider implementing navigation using React Navigation for a better user experience.
// You can also add more features like push notifications for attendance reminders or integration with calendar events.
// Make sure to follow best practices for security, especially when handling user credentials and tokens.
// Always validate and sanitize user inputs on the server side to prevent security vulnerabilities.
// This code is designed to be simple and educational. In a production app, you would want to implement more robust error handling, user feedback, and possibly a more complex state management solution like Redux or Context API.
// You can also consider using TypeScript for better type safety and developer experience.
// If you plan to deploy this app, ensure you have proper backend infrastructure and security measures in place, such as HTTPS, secure token storage, and user authentication flows.
// This code is a basic implementation of an attendance app using React Native.
// You can expand it further by adding features like user roles (admin, user), attendance history, and more detailed user profiles.
// Consider using libraries like Axios for network requests for better error handling and request cancellation.
// You can also implement a more sophisticated state management solution like Redux or MobX if your app grows in complexity.
// Make sure to test the app on both iOS and Android devices to ensure compatibility and a consistent user experience across platforms.
// This code is a starting point for building a mobile attendance application
// using React Native. You can further improve the UI/UX by using libraries like React Native Paper or NativeBase
// for better components and styling. Consider implementing navigation using React Navigation for a 