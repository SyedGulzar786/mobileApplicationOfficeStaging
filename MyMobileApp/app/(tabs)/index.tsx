import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, ScrollView, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API = 'http://192.168.100.174:5000'; // ⬅️ Replace with your local IP

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
      setAttendance(data);
    } catch (err) {
      console.error('Fetch error:', err);
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
      {attendance.map((record) => (
        <Text key={record._id}>{record.userId?.name ?? 'Unknown'}</Text>
      ))}
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
