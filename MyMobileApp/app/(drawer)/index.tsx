import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';

const API = 'http://192.168.100.174:5000'; // ✅ Replace with your server if needed

type AttendanceRecord = {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
  } | null;
  signedInAt?: string;
  signedOutAt?: string;
};

export default function AuthAttendanceScreen() {
  const { token, isAuthReady, isLoggedIn } = useAuth();
  const [userName, setUserName] = useState('');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetchedInitially, setHasFetchedInitially] = useState(false);

  const extractNameFromToken = (jwt: string): string => {
    try {
      const payload = jwt.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return decoded.name || decoded.email || '';
    } catch {
      return '';
    }
  };

  const fetchToday = async (tokenOverride?: string) => {
    try {
      const activeToken = tokenOverride || token;
      if (!activeToken) return;

      setLoading(true);

      const res = await fetch(`${API}/today`, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      const data = await res.json();
      setAttendance(Array.isArray(data) ? data : []);

      const extractedName = extractNameFromToken(activeToken);
      if (extractedName) setUserName(extractedName);
    } catch (error) {
      console.error('Failed to fetch attendance:', error);
      setAttendance([]);
    } finally {
      setLoading(false);
    }
  };

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
      fetchToday();
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
      fetchToday();
    } catch {
      Alert.alert('Error', 'Something went wrong');
    }
  };

  useEffect(() => {
    if (isAuthReady && isLoggedIn && token && !hasFetchedInitially) {
      fetchToday(token);
      setHasFetchedInitially(true);
    }
  }, [isAuthReady, isLoggedIn, token, hasFetchedInitially]);

  useFocusEffect(
    useCallback(() => {
      if (token) {
        fetchToday(token);
      }
    }, [token])
  );

  if (!isAuthReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const getMotivationalText = () => {
    const day = new Date().toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
    const messages: Record<string, string> = {
      monday: 'Monday – the starting of the day with lots of love!',
      tuesday: 'Tuesday – keep moving forward with strength!',
      wednesday: 'Wednesday – halfway to your goals!',
      thursday: 'Thursday – push harder, you’re almost there!',
      friday: 'Friday – wrap up strong!',
      saturday: 'Saturday – relax and recharge!',
      sunday: 'Sunday – a fresh breath before the week begins!',
    };
    return messages[day] || 'Have a great day!';
  };


  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>
          <View>
            <Text style={styles.welcome}>Welcome {userName}!</Text>
            <Text style={styles.motivation}>{getMotivationalText()}</Text>
          </View>
        </Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.signIn]}
            onPress={handleSignIn}
          >
            <Text style={styles.buttonText}>SIGN IN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.signOut]}
            onPress={handleSignOut}
          >
            <Text style={styles.buttonText}>SIGN OUT</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.space} />
        <Text style={styles.subtitle}>Today's Attendance</Text>

        {loading ? (
          <ActivityIndicator size="small" color="#888" />
        ) : attendance.length === 0 ? (
          <Text>No records found.</Text>
        ) : (
          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, styles.headerText]}>Date</Text>
              <Text style={[styles.tableCell, styles.headerText]}>Signed In</Text>
              <Text style={[styles.tableCell, styles.headerText]}>Signed Out</Text>
            </View>
            {attendance.map((record) => {
              const date = new Date(record.signedInAt || record.signedOutAt || '').toLocaleDateString();
              const signedIn = record.signedInAt ? new Date(record.signedInAt).toLocaleTimeString() : '-';
              const signedOut = record.signedOutAt ? new Date(record.signedOutAt).toLocaleTimeString() : '-';

              return (
                <View key={record._id} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{date}</Text>
                  <Text style={styles.tableCell}>{signedIn}</Text>
                  <Text style={styles.tableCell}>{signedOut}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    padding: 20,
    flexGrow: 1,
    alignItems: 'center',
  },
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    marginTop: 20,
    fontWeight: '600',
  },
  space: {
    height: 10,
  },
  tableContainer: {
    marginTop: 15,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 10,
    width: '100%',
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
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 20,
    marginBottom: 20,
  },
  signIn: {
    backgroundColor: '#4CAF50',
    paddingVertical: 18,
    paddingHorizontal: 30,
    borderRadius: 10,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  signOut: {
    backgroundColor: '#f44336',
    paddingVertical: 18,
    paddingHorizontal: 30,
    borderRadius: 10,
    flex: 1,
    marginLeft: 10,
    alignItems: 'center',
  },
  button: {
    elevation: 3,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  welcome:{
    fontSize: 26,
  },
  motivation: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 15,
  },
});
