// ... [IMPORTS unchanged]
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

const API = 'http://192.168.100.174:5000';

type AttendanceRecord = {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
  } | null;
  signedInAt?: string;
  signedOutAt?: string;
  timeWorked?: number; // ⏱️ newly added
};


export default function AuthAttendanceScreen() {
  const { token, isAuthReady, isLoggedIn } = useAuth();
  const [userName, setUserName] = useState('');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetchedInitially, setHasFetchedInitially] = useState(false);

  // ⏱️ Timer states
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Helper to format seconds as hh:mm:ss
  const formatTime = (totalSeconds: number) => {
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  useEffect(() => {
    let interval: number;

    if (isTimerRunning) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);


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

      filtered.sort((a, b) =>
        new Date(b.signedInAt || b.signedOutAt || '').getTime() -
        new Date(a.signedInAt || a.signedOutAt || '').getTime()
      );

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
      setElapsedSeconds(0);     // ⏱️ Reset timer
      setIsTimerRunning(true);  // ⏱️ Start timer
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
      setIsTimerRunning(false); // ⏱️ Stop timer
      // setElapsedSeconds(0);     // ❌ Remove this line for now ← 🛑 Do NOT reset yet (we'll show it first)
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
    return format(now, 'EEE - dd MMM, yyyy');
  };

  const formatHoursAndMinutes = (decimalHours: number): string => {
  const totalMinutes = Math.round(decimalHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours > 0 ? `${hours} hr${hours > 1 ? 's' : ''}` : ''}${
    minutes > 0 ? ` ${minutes} min${minutes > 1 ? 's' : ''}` : ''
  }`.trim();
};


  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={styles.title}>
          <Text style={[styles.welcome]}>Welcome {userName}!</Text>
          <Text style={styles.motivation}>{getMotivationalText()}</Text>
        </View>

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

        {/* Today's Record */}
        {(() => {
          const today = new Date().toDateString();
          const todaysRecord = attendance.find((record) => {
            const date = new Date(record.signedInAt || record.signedOutAt || '').toDateString();
            return date === today;
          });

          if (!todaysRecord) {
            return <Text style={styles.noToday}>No attendance record for today.</Text>;
          }

          const signedIn = todaysRecord.signedInAt
            ? new Date(todaysRecord.signedInAt).toLocaleTimeString()
            : '-';
          const signedOut = todaysRecord.signedOutAt
            ? new Date(todaysRecord.signedOutAt).toLocaleTimeString()
            : '-';

          return (
            <View style={styles.tableContainer}>
              <View style={styles.recordBlock}>
                <View style={styles.recordRow}>
                  <View style={styles.recordColumn}>
                    <Text style={styles.largeColumnTitle}>Signed In</Text>
                    <Text style={styles.columnValue}>{signedIn}</Text>
                  </View>
                  <View style={styles.recordColumn}>
                    <Text style={styles.largeColumnTitle}>Signed Out</Text>
                    <Text style={styles.columnValue}>{signedOut}</Text>
                  </View>
                </View>
                {!isTimerRunning && todaysRecord.timeWorked != null && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ textAlign: 'center', fontSize: 18, color: '#2c3e50' }}>
                      Time Worked Today:{' '}
                      <Text style={{ fontWeight: 'bold' }}>
                     {formatHoursAndMinutes(todaysRecord.timeWorked!)}
                      </Text>
                    </Text>
                  </View>
                )}

              </View>


              {/* 🕒 TIMER DISPLAY */}
              {isTimerRunning && (
                <View style={{ marginTop: 10 }}>
                  {isTimerRunning ? (
                    <Text style={{ textAlign: 'center', fontSize: 18, color: '#2c3e50' }}>
                      Time Since Sign In:{' '}
                      <Text style={{ fontWeight: 'bold' }}>{formatTime(elapsedSeconds)}</Text>
                    </Text>
                  ) : elapsedSeconds > 0 ? (
                    <Text style={{ textAlign: 'center', fontSize: 18, color: '#2c3e50' }}>
                      Total Time Worked:{' '}
                      <Text style={{ fontWeight: 'bold' }}>{formatTime(elapsedSeconds)}</Text>
                    </Text>
                  ) : null}
                </View>

              )}
            </View>
          );
        })()}

        <Text style={styles.subtitle}>This Week's Attendance</Text>

        {loading ? (
          <ActivityIndicator size="small" color="#888" />
        ) : attendance.length === 0 ? (
          <Text>No records found.</Text>
        ) : (
          <View style={styles.tableContainer}>
            {attendance.map((record) => {
              const date = new Date(record.signedInAt || record.signedOutAt || '');
              const formattedDate = format(date, 'EEE - dd MMM, yyyy');
              const signedIn = record.signedInAt
                ? new Date(record.signedInAt).toLocaleTimeString()
                : '-';
              const signedOut = record.signedOutAt
                ? new Date(record.signedOutAt).toLocaleTimeString()
                : '-';

              return (
                <View key={record._id} style={styles.recordBlock}>
                  <Text style={styles.recordDate}>{formattedDate}</Text>
                  <View style={styles.largeRecordRow}>
                    <View style={styles.largeColumn}>
                      <Text style={styles.weekColumnTitle}>Signed In</Text>
                      <Text style={styles.weekLargeColumnValue}>{signedIn}</Text>
                    </View>
                    <View style={styles.largeColumn}>
                      <Text style={styles.weekColumnTitle}>Signed Out</Text>
                      <Text style={styles.weekLargeColumnValue}>{signedOut}</Text>
                    </View>
                    <View style={styles.largeColumn}>
                      <Text style={styles.weekColumnTitle}>Time Worked</Text>
                      <Text style={styles.weekLargeColumnValue}>
                    {record.timeWorked ? formatHoursAndMinutes(record.timeWorked) : '--'}
                      </Text>
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
    padding: 10,
    flexGrow: 1,
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
  },
    welcome: {
    fontSize: 26,
        fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  motivation: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 15,
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
  largeColumnTitle: {
    fontSize: 21,
    fontWeight: '500',
    color: '#555',
  },
  columnValue: {
    fontSize: 21,
    fontWeight: 'bold',
    // color: '#2ecc71',
    color: '#27ae60',
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
  // largeRecordRow: {
  //   // flexDirection: 'row',
  //   // justifyContent: 'space-around',
  //   paddingVertical: 10,
  //   backgroundColor: '#f1f1f1',
  //   borderRadius: 10,
  // },
  largeRecordRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    backgroundColor: '#f1f1f1',
    borderRadius: 10,
  },

  largeColumn: {
    flex: 1,
    alignItems: 'center',
  },

  weekColumnTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 5,
  },

  weekLargeColumnValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#27ae60',
    // color: '#2ecc71',

  },
  largeColumnValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#27ae60',
    // color: '#2ecc71',

  },
  todayContainer: {
    marginTop: 15,
    marginBottom: 10,
    padding: 15,
    backgroundColor: '#ecf0f1',
    borderRadius: 10,
  },

  noToday: {
    fontSize: 16,
    textAlign: 'center',
    marginVertical: 10,
    color: '#888',
  },



});
