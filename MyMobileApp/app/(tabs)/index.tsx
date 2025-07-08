// --- All imports remain unchanged ---
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

const API = 'http://192.168.100.174:5000';

type AttendanceRecord = {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
    role?: string;
  } | null;
  signedInAt?: string;
  signedOutAt?: string;
};

export default function AuthAttendanceScreen() {
  const [role, setRole] = useState('');
  const [isReset, setIsReset] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [resetName, setResetName] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');

  const register = async () => {
    try {
      const res = await fetch(`${API}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.message || 'Registration failed');
        return;
      }
      Alert.alert('Success', 'User registered. Now log in.');
      setIsLogin(true);
    } catch {
      Alert.alert('Error', 'Registration failed');
    }
  };

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

      await AsyncStorage.setItem('token', data.token);
      setToken(data.token);
      setIsLoggedIn(true);
      Alert.alert('Success', 'Logged in');
      fetchToday(data.token);
    } catch {
      Alert.alert('Error', 'Login failed');
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('token');
    setToken(null);
    setIsLoggedIn(false);
    setEmail('');
    setPassword('');
    setAttendance([]);
    Alert.alert('Logged out');
  };

  const fetchToday = async (tokenOverride?: string) => {
    try {
      const res = await fetch(`${API}/today`);
      const data = await res.json();
      setAttendance(Array.isArray(data) ? data : []);
    } catch {
      setAttendance([]);
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
        body: JSON.stringify({ name: resetName, email: resetEmail, newPassword: newResetPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.message || 'Reset failed');
        return;
      }

      Alert.alert('Success', data.message || 'Password reset successful');
      setIsReset(false);
      setIsLogin(true);
    } catch {
      Alert.alert('Error', 'Something went wrong');
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

  const handleSignIn = async () => {
    try {
      const res = await fetch(`${API}/attendance/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Sign In Failed', data.message || 'Already signed in today');
        return;
      }

      Alert.alert('Success', data.message || 'Signed in');
      fetchToday(token!);
    } catch {
      Alert.alert('Error', 'Something went wrong');
    }
  };

  const handleSignOut = async () => {
    try {
      const res = await fetch(`${API}/attendance/signout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Sign Out Failed', data.message || 'Already signed out or not signed in yet');
        return;
      }

      Alert.alert('Success', data.message || 'Signed out');
      fetchToday(token!);
    } catch {
      Alert.alert('Error', 'Something went wrong');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {!isLoggedIn ? (
        <View style={styles.card}>
          <Text style={styles.title}>
            {isReset ? 'Reset Password' : isLogin ? 'Login' : 'Register'}
          </Text>

          {!isLogin && !isReset && (
            <>
              <TextInput
                placeholder="Name"
                value={name}
                onChangeText={setName}
                style={styles.input}
              />
              <TextInput
                placeholder="Role (optional)"
                value={role}
                onChangeText={setRole}
                style={styles.input}
              />
            </>
          )}

          <TextInput
            placeholder="Email"
            value={isReset ? resetEmail : email}
            onChangeText={(text) => (isReset ? setResetEmail(text) : setEmail(text))}
            style={styles.input}
          />

          {!isReset && (
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
          )}

          {isReset && (
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
              <Text
                style={styles.linkText}
                onPress={() => {
                  setIsReset(false);
                  setIsLogin(true);
                }}
              >
                Back to Login
              </Text>
            </>
          ) : isLogin ? (
            <>
              <Button title="Login" onPress={login} />
              <Text
                style={styles.linkText}
                onPress={() => {
                  setIsLogin(false);
                  setIsReset(false);
                }}
              >
                Don't have an account? Register
              </Text>
              <Text style={styles.linkText} onPress={() => setIsReset(true)}>
                Forgot Password?
              </Text>
            </>
          ) : (
            <>
              <Button title="Register" onPress={register} />
              <Text
                style={styles.linkText}
                onPress={() => {
                  setIsLogin(true);
                  setIsReset(false);
                }}
              >
                Already have an account? Login
              </Text>
            </>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.title}>Welcome!</Text>
          <Button title="Logout" onPress={logout} />
          <View style={styles.space} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <Button title="Sign In" onPress={handleSignIn} color="#4CAF50" />
            <Button title="Sign Out" onPress={handleSignOut} color="#f44336" />
          </View>
          <View style={styles.space} />
          <Text style={styles.subtitle}>Attendance Records</Text>

          {attendance.length === 0 ? (
            <Text>No records found.</Text>
          ) : (
            Object.entries(
              attendance.reduce((grouped, record) => {
                const dateKey = record.signedInAt
                  ? new Date(record.signedInAt).toLocaleDateString()
                  : 'Unknown';
                if (!grouped[dateKey]) grouped[dateKey] = [];
                grouped[dateKey].push(record);
                return grouped;
              }, {} as Record<string, AttendanceRecord[]>)
            ).map(([date, records]) => (
              <View key={date} style={styles.tableContainer}>
                <Text style={styles.tableTitle}>📅 {date}</Text>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableCell, styles.headerText]}>Name</Text>
                  <Text style={[styles.tableCell, styles.headerText]}>Email</Text>
                  <Text style={[styles.tableCell, styles.headerText]}>Role</Text>
                  <Text style={[styles.tableCell, styles.headerText]}>Signed In</Text>
                  <Text style={[styles.tableCell, styles.headerText]}>Signed Out</Text>
                </View>
                {records.map((record) => (
                  <View key={record._id} style={styles.tableRow}>
                    <Text style={styles.tableCell}>{record.userId?.name || '-'}</Text>
                    <Text style={styles.tableCell}>{record.userId?.email || '-'}</Text>
                    <Text style={styles.tableCell}>{record.userId?.role || 'User'}</Text>
                    <Text style={styles.tableCell}>
                      {record.signedInAt ? new Date(record.signedInAt).toLocaleTimeString() : 'Not Signed In'}
                    </Text>
<Text style={styles.tableCell}>
  {record.signedOutAt
    ? new Date(record.signedOutAt).toLocaleTimeString()
    : record.signedInAt
    ? new Date(record.signedInAt).toDateString() === new Date().toDateString()
      ? 'Not Signed Out'
      : 'Forgot to Sign Out'
    : '-'}
</Text>
                  </View>
                ))}
              </View>
            ))
          )}
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
  subtitle: { fontSize: 18, marginTop: 20 },
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
  passwordInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, marginRight: 10 },
  linkText: { color: 'blue', marginTop: 10, textAlign: 'center' },
  space: { height: 10 },
  tableContainer: {
    marginBottom: 30,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 10,
    width: '100%',
  },
  tableTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    paddingBottom: 6,
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  tableCell: {
    flex: 1,
    fontSize: 12,
    color: '#444',
  },
  headerText: {
    fontWeight: 'bold',
    color: '#000',
  },
});
