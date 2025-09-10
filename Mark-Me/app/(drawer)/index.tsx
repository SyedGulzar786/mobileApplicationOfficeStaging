// ... [IMPORTS unchanged]
import { decode as atob } from 'base-64';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { forceLightMode } from "@/utils/forceLightMode";
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { format } from 'date-fns';
import { API_BASE_URL, ALLOWED_IP } from '../../constants/env';
import { formatDuration } from '../../utils/formatDuration';
import ProtectedRoute from '@/utils/ProtectedRoute';
console.log("📱 index.tsx loaded");

// Set notification behavior globally
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// const API = 'http://192.168.100.174:5000';
const API = API_BASE_URL;


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
  const [user, setUser] = useState<{ userId: string; name: string; email: string } | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [todaysRecords, setTodaysRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetchedInitially, setHasFetchedInitially] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [pendingSignIn, setPendingSignIn] = useState(false);



  // Track expanded/collapsed state of each day
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  const toggleDayExpansion = (dateKey: string) => {
    setExpandedDays((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

  // Group attendance records by local date string (e.g. "Mon - 01 Sep, 2025")
  const groupAttendanceByDate = (records: AttendanceRecord[]) => {
    const map = new Map<string, AttendanceRecord[]>();
    records.forEach((rec) => {
      const dateObj = new Date(rec.signedInAt || rec.signedOutAt || '');
      const dateKey = dateObj.toDateString(); // groups by day (local)
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(rec);
    });

    // Convert to array and sort by date descending (most recent first)
    const grouped = Array.from(map.entries()).map(([dateKey, sessions]) => {
      const date = new Date(dateKey);
      // sort sessions in descending order of signedIn/signedOut time
      sessions.sort((a, b) =>
        new Date(b.signedInAt || b.signedOutAt || '').getTime() -
        new Date(a.signedInAt || a.signedOutAt || '').getTime()
      );
      return { dateKey, date, sessions };
    });

    grouped.sort((a, b) => b.date.getTime() - a.date.getTime());
    return grouped;
  };
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
    let interval: ReturnType<typeof setInterval>;

    if (isTimerRunning) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);

  useEffect(() => {
    const registerForPushNotifications = async () => {
      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') {
          console.log('Failed to get push token for notifications!');
        }
      } else {
        console.log('Must use physical device for Push Notifications');
      }
    };

    registerForPushNotifications();
  }, []);

  const extractUserFromToken = (jwt: string): { userId: string; name: string; email: string } | null => {
    try {
      const payload = jwt.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return {
        userId: decoded.userId,
        name: decoded.name,
        email: decoded.email,
      };
    } catch (err) {
      return null;
    }
  };

  const getWeeklySignOutMessage = () => {
    const day = new Date().toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
    const messages: Record<string, string> = {
      monday: "You’ve done a great job today — now it’s time to check out, champ!",
      tuesday: "Great work today! Go ahead and check out, champ.",
      wednesday: "Nice job today — time to sign out, champ!",
      thursday: "Well done today. You can sign out now, champ!",
      friday: "You've completed your work for the day — feel free to check out.",
      saturday: "You’ve pushed too hard — have some rest now.",
    };
    return messages[day] || "Have a great day!";
  };

  const sendMotivationalNotification = async () => {
    const message = getWeeklySignOutMessage();

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.log('Notification permission not granted.');
      return;
    }

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Office App',
          body: message,
          sound: 'default',
        },
        trigger: null, // Show immediately
      });

      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      console.log('Scheduled notifications:', scheduled);

    } catch (error) {
      console.warn('Notification schedule failed:', error);
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

      console.log('📡 Fetching attendance from:', `${API}/attendance/week`);
      console.log('📥 Weekly attendance response status:', res.status);

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

      const decodedUser = extractUserFromToken(activeToken);
      if (decodedUser) {
        setUser(decodedUser);
        setUserName(decodedUser.name);
      }

    } catch (error) {
      console.error('Failed to fetch attendance:', error);

      const status = await AsyncStorage.getItem('signedInStatus');
      if (status === 'true') {
        await sendMotivationalNotification();
      }

      setAttendance([]);
    }

    finally {
      setLoading(false);
    }
  };

  const performSignIn = async () => {
    console.log('🔼 Sending Sign In request...');
    try {
      const res = await fetch(`${API}/attendance/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });
      console.log('📥 Sign In response status:', res.status);
      const data = await res.json();
      console.log('📥 Sign In response body:', data);

      if (!res.ok) {
        Alert.alert('Sign In Failed', data.message || 'Already signed in today');
        return;
      }

      Alert.alert('Success', data.message || 'Signed in');
      await AsyncStorage.setItem('signedInStatus', 'true');
      fetchLast7Days();
      setElapsedSeconds(0);
      setIsTimerRunning(true);
    } catch (err) {
      console.error('❌ Sign In error:', err);
      Alert.alert('Error', 'Something went wrong during Sign In');
    }
  };

  const handleSignIn = async () => {
    const currentStatus = await AsyncStorage.getItem('signedInStatus');
    if (currentStatus === 'true') {
      // Session already active → show modal instead of signing in
      setShowSessionModal(true);
      setPendingSignIn(true);
      return;
    }
    performSignIn();
  };

  const handleClosePreviousAndSignIn = async () => {
    setShowSessionModal(false);
    await handleSignOut();
    performSignIn();
    setPendingSignIn(false);
  };

  const handleKeepSession = () => {
    setShowSessionModal(false);
    setPendingSignIn(false);
  };

  const handleSignOut = async () => {
    console.log('🔼 Sending Sign Out request...');

    try {
      const res = await fetch(`${API}/attendance/signout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      console.log('📥 Sign Out response status:', res.status);
      const data = await res.json();
      console.log('📥 Sign Out response body:', data);

      if (!res.ok) {
        Alert.alert('Sign Out Failed', data.message || 'Already signed out or not signed in yet');
        return;
      }

      Alert.alert('Success', data.message || 'Signed out');
      await AsyncStorage.setItem('signedInStatus', 'false');
      fetchLast7Days();
      setIsTimerRunning(false);
    } catch (err) {
      console.error('❌ Sign Out error:', err);
      Alert.alert('Error', 'Something went wrong during Sign Out');
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
  forceLightMode();
  return (
    <ProtectedRoute>
      <ScrollView contentContainerStyle={styles.container}>

        {/* Session Conflict Modal */}
        <Modal
          visible={showSessionModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSessionModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Sorry</Text>
              <Text style={styles.modalMessage}>
                Do you want me to close the last session?
              </Text>
              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.signOut]}
                  onPress={handleClosePreviousAndSignIn}
                >
                  <Text style={styles.buttonText}>Close Session</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.signIn]}
                  onPress={handleKeepSession}
                >
                  <Text style={styles.buttonText}>Keep Session</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View style={styles.card}>
          <View>
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
                          {formatDuration(todaysRecord.signedInAt!, todaysRecord.signedOutAt!)}
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
                    ) : todaysRecord ? (
                      <Text style={{ textAlign: 'center', fontSize: 18, color: '#2c3e50' }}>
                        Total Time Worked:{' '}
                        <Text style={{ fontWeight: 'bold' }}>
                          {todaysRecord.signedInAt
                            ? formatDuration(todaysRecord.signedInAt, todaysRecord.signedOutAt)
                            : "--"}
                        </Text>
                      </Text>
                    ) : null}
                  </View>

                )}
              </View>
            );
          })()}

          {/* 📝 Today’s Log Section */}        <Text style={styles.subtitle}>Today&apos;s Log</Text>        {(() => { const today = new Date().toDateString(); const todaysRecords = attendance.filter((rec) => { const date = new Date(rec.signedInAt || rec.signedOutAt || "").toDateString(); return date === today; }); if (todaysRecords.length === 0) { return <Text style={styles.noToday}>No log entries for today.</Text>; } return (<View style={styles.tableContainer}>              {todaysRecords.map((rec) => { const signedIn = rec.signedInAt ? new Date(rec.signedInAt).toLocaleTimeString() : "--"; const signedOut = rec.signedOutAt ? new Date(rec.signedOutAt).toLocaleTimeString() : "--"; const duration = rec.signedInAt ? formatDuration(rec.signedInAt, rec.signedOutAt) : "--"; return (<View key={rec._id} style={styles.recordBlock}>                    <View style={styles.largeRecordRow}>                      <View style={styles.largeColumn}>                        <Text style={styles.weekColumnTitle}>Signed In</Text>                        <Text style={styles.weekLargeColumnValue}>{signedIn}</Text>                      </View>                      <View style={styles.largeColumn}>                        <Text style={styles.weekColumnTitle}>Signed Out</Text>                        <Text style={styles.weekLargeColumnValue}>{signedOut}</Text>                      </View>                      <View style={styles.largeColumn}>                        <Text style={styles.weekColumnTitle}>Duration</Text>                        <Text style={styles.weekLargeColumnValue}>{duration}</Text>                      </View>                    </View>                  </View>); })}            </View>); })()}

          <Text style={styles.subtitle}>This Week's Attendance</Text>

          {loading ? (
            <ActivityIndicator size="small" color="#888" />
          ) : attendance.length === 0 ? (
            <Text>No records found.</Text>
          ) : (
            <View style={styles.tableContainer}>
              {groupAttendanceByDate(attendance).map(({ dateKey, date, sessions }) => {
                const formattedDate = format(date, 'EEE - dd MMM, yyyy');
                const expanded = expandedDays[dateKey];
                const latest = sessions[0];
                const rest = sessions.slice(1);

                const renderRow = (rec: AttendanceRecord) => {
                  const signedIn = rec.signedInAt ? new Date(rec.signedInAt).toLocaleTimeString() : '—';
                  const signedOut = rec.signedOutAt ? new Date(rec.signedOutAt).toLocaleTimeString() : '—';
                  const duration = rec.signedInAt ? formatDuration(rec.signedInAt, rec.signedOutAt) : '—';
                  return (
                    <View
                      key={rec._id}
                      style={[
                        styles.recordRow,
                        { backgroundColor: '#ffffff', paddingVertical: 12, borderRadius: 8, marginBottom: 8 },
                      ]}
                    >
                      <View style={styles.largeColumn}>
                        <Text style={styles.weekLargeColumnValue}>{signedIn}</Text>
                      </View>
                      <View style={styles.largeColumn}>
                        <Text style={styles.weekLargeColumnValue}>{signedOut}</Text>
                      </View>
                      <View style={styles.largeColumn}>
                        <Text style={styles.weekLargeColumnValue}>{duration}</Text>
                      </View>
                    </View>
                  );
                };

                return (
                  <View key={dateKey} style={styles.recordBlock}>
                    <View style={sessions.length > 1 ? { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } : { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={sessions.length > 1 ? { display: "flex" } : { display: "none" }}></Text>
                      <Text style={styles.recordDate}>{formattedDate}</Text>
                      {sessions.length > 1 && (
                        <TouchableOpacity onPress={() => toggleDayExpansion(dateKey)}>
                          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2980b9' }}>
                            {expanded ? '✕' : '⋮'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* header row */}
                    <View style={[styles.largeRecordRow, { marginBottom: 8, paddingVertical: 8 }]}>
                      <View style={styles.largeColumn}>
                        <Text style={styles.weekColumnTitle}>Signed In</Text>
                      </View>
                      <View style={styles.largeColumn}>
                        <Text style={styles.weekColumnTitle}>Signed Out</Text>
                      </View>
                      <View style={styles.largeColumn}>
                        <Text style={styles.weekColumnTitle}>Time Worked</Text>
                      </View>
                    </View>

                    {/* always show latest */}
                    {latest && renderRow(latest)}

                    {/* show rest only if expanded */}
                    {expanded && rest.map(renderRow)}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </ProtectedRoute>

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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#2c3e50',
  },
  modalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#555',
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 5,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },

});
