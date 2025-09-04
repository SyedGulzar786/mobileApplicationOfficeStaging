import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../constants/env';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API = API_BASE_URL;

type AttendanceRecord = {
  _id: string;
  date: string;
  signedInAt?: string;
  signedOutAt?: string;
};

export default function AttendanceRecordsScreen() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAttendance = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        Alert.alert('Unauthorized', 'You must log in first.');
        return;
      }

      const res = await fetch(`${API}/attendance/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error fetching records');

      const sorted = data.map((r: any) => {
        const date = new Date(r.date);
        const signedInAt = r.signedInAt
          ? new Date(r.signedInAt).toLocaleTimeString()
          : 'Not Signed In';

        let signedOutAt = 'Absent';
        if (r.signedInAt && r.signedOutAt) {
          signedOutAt = new Date(r.signedOutAt).toLocaleTimeString();
        } else if (r.signedInAt && !r.signedOutAt) {
          const isToday =
            new Date(r.signedInAt).toDateString() ===
            new Date().toDateString();
          signedOutAt = isToday ? 'Not Signed Out' : 'Forgot to Sign Out';
        }

        return {
          _id: r._id,
          date: date.toDateString(),
          signedInAt,
          signedOutAt,
        };
      });

      setRecords(sorted);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>📋 My Attendance Records</Text>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : records.length === 0 ? (
        <Text>No records found.</Text>
      ) : (
        records.map((record) => (
          <View key={record._id} style={styles.record}>
            <Text style={styles.date}>{record.date}</Text>
            <Text style={styles.time}>Signed In: {record.signedInAt}</Text>
            <Text style={styles.time}>Signed Out: {record.signedOutAt}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    flexGrow: 1,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  record: {
    backgroundColor: '#f0f8ff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  date: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
    color: '#333',
  },
  time: {
    fontSize: 14,
    color: '#555',
  },
});
