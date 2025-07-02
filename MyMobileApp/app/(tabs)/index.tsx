import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const API = 'http://192.168.100.174:5000'; // Replace with your local IP

type AttendanceRecord = {
  _id: string;
  userId: {
    _id: string;
    name: string;
    role?: string;
  } | null;
};

export default function AuthAttendanceScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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
      setIsLoggedIn(true);
      Alert.alert('Success', 'Logged in');
      fetchToday(data.token);
    } catch (err) {
      console.error('Login error:', err);
      Alert.alert('Error', 'Login failed');
    }
  };

  // Logout
  const logout = async () => {
    await AsyncStorage.removeItem('token');
    setToken(null);
    setIsLoggedIn(false);
    setName('');
    setEmail('');
    setPassword('');
    setAttendance([]);
    Alert.alert('Logged out');
  };

  // Mark attendance
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

  // Fetch attendance
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

  // Reset password
  const resetPassword = async () => {
    try {
      const res = await fetch(`${API}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.message || 'Reset failed');
        return;
      }

      Alert.alert('Success', 'Password reset successfully');
      setNewPassword('');
    } catch (err) {
      Alert.alert('Error', 'Reset failed');
    }
  };

  useEffect(() => {
    const loadToken = async () => {
      const stored = await AsyncStorage.getItem('token');
      if (stored) {
        setToken(stored);
        setIsLoggedIn(true);
        fetchToday(stored);
      }
    };
    loadToken();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {!isLoggedIn ? (
        <View style={styles.card}>
          <Text style={styles.title}>Login / Sign Up</Text>
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
        </View>
      ) : (
        <View style={{ width: '100%' }}>
          <Button title="Mark Attendance" onPress={markAttendance} />
          <View style={styles.space} />
          <Button title="Logout" onPress={logout} color="#e74c3c" />
          <Text style={styles.subtitle}>Today's Attendance:</Text>
          {Array.isArray(attendance) && attendance.length > 0 ? (
            attendance.map((record) => (
              <View key={record._id} style={styles.recordRow}>
                <Text>{record.userId?.name ?? 'Unknown'}</Text>
                <Text style={styles.roleText}>{record.userId?.role ?? 'User'}</Text>
                <Text style={styles.timeText}>
                  {new Date(parseInt(record._id.substring(0, 8), 16) * 1000).toLocaleString()}
                </Text>
              </View>
            ))
          ) : (
            <Text>No attendance records found</Text>
          )}

          <Text style={styles.subtitle}>Reset Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              placeholder="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showResetPassword}
              style={styles.passwordInput}
            />
            <TouchableOpacity onPress={() => setShowResetPassword(!showResetPassword)}>
              <Ionicons name={showResetPassword ? 'eye-off' : 'eye'} size={22} color="gray" />
            </TouchableOpacity>
          </View>
          <Button title="Reset Password" onPress={resetPassword} />
        </View>
      )}
    </ScrollView>
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
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  input: { borderWidth: 1, width: '100%', padding: 10, marginBottom: 10 },
  subtitle: { fontSize: 18, marginTop: 20 },
  space: { height: 10 },
  recordRow: {
    backgroundColor: '#f9f9f9',
    padding: 10,
    borderBottomWidth: 1,
    borderColor: '#ddd',
  },
  roleText: { fontSize: 12, color: '#555' },
  timeText: { fontSize: 12, color: '#777' },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    width: '100%',
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  passwordInput: { flex: 1, paddingVertical: 10 },
});
