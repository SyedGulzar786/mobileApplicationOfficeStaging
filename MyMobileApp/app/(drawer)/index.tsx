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
import { format } from 'date-fns';

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

  const fetchLast7Days = async (tokenOverride?: string) => {
    try {
      const activeToken = tokenOverride || token;
      if (!activeToken) return;

      setLoading(true);

      const res = await fetch(`${API}/attendance/week`, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      const data = await res.json();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

      const filtered = (Array.isArray(data) ? data : []).filter((record) => {
        const date = new Date(record.signedInAt || record.signedOutAt || '');
        return date >= sevenDaysAgo;
      });

      filtered.sort((a, b) => new Date(b.signedInAt || b.signedOutAt || '').getTime() - new Date(a.signedInAt || a.signedOutAt || '').getTime());

      setAttendance(filtered);

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
      fetchLast7Days();
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
      fetchLast7Days();
    } catch {
      Alert.alert('Error', 'Something went wrong');
    }
  };

  useEffect(() => {
    if (isAuthReady && isLoggedIn && token && !hasFetchedInitially) {
      fetchLast7Days(token);
      setHasFetchedInitially(true);
    }
  }, [isAuthReady, isLoggedIn, token, hasFetchedInitially]);

  useFocusEffect(
    useCallback(() => {
      if (token) {
        fetchLast7Days(token);
      }
    }, [token])
  );

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

const formatDateTitle = () => {
  const now = new Date();
  return format(now, "EEE - dd-MMM, yyyy");
};


  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>
          <Text style={styles.welcome}>Welcome {userName}!</Text>
          <Text style={styles.motivation}>{getMotivationalText()}</Text>
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

        <Text style={styles.dateHeading}>{formatDateTitle()}</Text>

        <Text style={styles.subtitle}>Last Week's Attendance</Text>

        {loading ? (
          <ActivityIndicator size="small" color="#888" />
        ) : attendance.length === 0 ? (
          <Text>No records found.</Text>
        ) : (
          <View style={styles.tableContainer}>
            {attendance.map((record) => {
              const date = new Date(record.signedInAt || record.signedOutAt || '').toDateString();
              const signedIn = record.signedInAt ? new Date(record.signedInAt).toLocaleTimeString() : '-';
              const signedOut = record.signedOutAt ? new Date(record.signedOutAt).toLocaleTimeString() : '-';

              return (
                <View key={record._id} style={styles.recordBlock}>
                  <Text style={styles.recordDate}>{date}</Text>
                  <View style={styles.recordRow}>
                    <View style={styles.recordColumn}>
                      <Text style={styles.columnTitle}>Signed In</Text>
                      <Text style={styles.columnValue}>{signedIn}</Text>
                    </View>
                    <View style={styles.recordColumn}>
                      <Text style={styles.columnTitle}>Signed Out</Text>
                      <Text style={styles.columnValue}>{signedOut}</Text>
                    </View>
                  </View>
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
    fontSize: 20,
    marginTop: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: '#2c3e50',
  },
  dateHeading: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 10,
    color: '#2980b9',
  },
  tableContainer: {
    marginTop: 15,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 10,
    width: '100%',
  },
  recordBlock: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    elevation: 2,
  },
  recordDate: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#34495e',
    textAlign: 'center',
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  recordColumn: {
    alignItems: 'center',
    flex: 1,
  },
  columnTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#555',
  },
  columnValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2ecc71',
    marginTop: 5,
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
  welcome: {
    fontSize: 26,
  },
  motivation: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 15,
  },
});
