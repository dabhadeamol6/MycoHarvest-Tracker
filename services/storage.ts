import { User, AttendanceRecord, UserRole } from '../types';

const USERS_KEY = 'OFFICEROUTE_USERS';
const ATTENDANCE_KEY = 'OFFICEROUTE_ATTENDANCE';
const CLOUD_URL_KEY = 'OFFICEROUTE_CLOUD_URL';

// Initial Data with Specific Credentials
const INITIAL_USERS: User[] = [
  {
    id: 'ADMIN_001',
    employeeId: 'MH-ADM-01',
    name: 'Amol Admin',
    email: 'admin@mycoharvest.in',
    password: 'Amol@0691',
    role: UserRole.ADMIN,
    department: 'Management',
    position: 'System Administrator',
    gender: 'Male',
    joinedDate: '2023-01-01',
    allowedLocations: [
      { type: 'OFFICE', latitude: 18.5204, longitude: 73.8567, radiusMeters: 500 } // Example: Pune
    ]
  },
  {
    id: 'EMP_001',
    employeeId: 'MH-EMP-01',
    name: 'Nikita Dabhade',
    email: 'nikita.dabhade@mycoharvest.in',
    password: 'Mycoharvest@12345',
    role: UserRole.USER,
    department: 'Operations',
    position: 'Operations Executive',
    gender: 'Female',
    joinedDate: '2023-03-15',
    allowedLocations: [
      { type: 'OFFICE', latitude: 18.5204, longitude: 73.8567, radiusMeters: 500 },
      { type: 'HOME', latitude: 0, longitude: 0, radiusMeters: 0 } // Authorized for WFH
    ]
  }
];

export const StorageService = {
  initialize: () => {
    if (!localStorage.getItem(USERS_KEY)) {
      localStorage.setItem(USERS_KEY, JSON.stringify(INITIAL_USERS));
    }
    if (!localStorage.getItem(ATTENDANCE_KEY)) {
      localStorage.setItem(ATTENDANCE_KEY, JSON.stringify([]));
    }
  },

  getUsers: (): User[] => {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  },

  addUser: (user: User) => {
    const users = StorageService.getUsers();
    users.push(user);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  updateUser: (updatedUser: User) => {
    let users = StorageService.getUsers();
    users = users.map(u => u.id === updatedUser.id ? updatedUser : u);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  getAttendance: (): AttendanceRecord[] => {
    return JSON.parse(localStorage.getItem(ATTENDANCE_KEY) || '[]');
  },

  saveAttendanceRecord: (record: AttendanceRecord) => {
    const records = StorageService.getAttendance();
    const index = records.findIndex(r => r.id === record.id);
    if (index >= 0) {
      records[index] = record;
    } else {
      records.push(record);
    }
    localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(records));
  },

  getCurrentUserAttendanceForDate: (userId: string, date: string): AttendanceRecord | undefined => {
    const records = StorageService.getAttendance();
    return records.find(r => r.userId === userId && r.date === date);
  },
  
  // --- Cloud Sync Logic ---
  
  getCloudUrl: (): string => {
    return localStorage.getItem(CLOUD_URL_KEY) || '';
  },

  setCloudUrl: (url: string) => {
    localStorage.setItem(CLOUD_URL_KEY, url);
  },

  syncData: async (): Promise<{success: boolean, message: string}> => {
    const url = StorageService.getCloudUrl();
    if (!url) {
      return { success: false, message: "No Cloud URL configured." };
    }
    
    if (!url.includes('script.google.com')) {
         return { success: false, message: "Invalid URL. Please check Sync settings." };
    }

    try {
      // --- STEP 1: PULL (GET) ---
      // We fetch data first to ensure we don't overwrite the cloud with empty local data (e.g. on a new PC)
      let cloudData = { users: [], attendance: [] };
      
      try {
        const getResponse = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            credentials: 'omit'
        });
        
        if (getResponse.ok) {
            const json = await getResponse.json();
            if (json.status === 'success' && json.data) {
                cloudData = json.data;
            }
        }
      } catch (e) {
        console.warn("Could not fetch cloud data, proceeding to push if local data exists.", e);
      }

      // --- STEP 2: MERGE ---
      const localUsers = StorageService.getUsers();
      const localAttendance = StorageService.getAttendance();

      // Merge Users (Dedup by ID)
      const mergedUsersMap = new Map();
      // Add cloud users first
      if (Array.isArray(cloudData.users)) {
        cloudData.users.forEach((u: User) => mergedUsersMap.set(u.id, u));
      }
      // Add local users (local takes precedence if conflict, or we can assume cloud is master. 
      // For "restore" functionality, if local is the Default Init set, we should prefer Cloud).
      const isLocalDefault = localUsers.length === 2 && localUsers[0].id === 'ADMIN_001';
      
      if (!isLocalDefault || mergedUsersMap.size === 0) {
        localUsers.forEach(u => mergedUsersMap.set(u.id, u));
      }
      
      const mergedUsers = Array.from(mergedUsersMap.values());

      // Merge Attendance (Dedup by ID)
      const mergedAttendanceMap = new Map();
      if (Array.isArray(cloudData.attendance)) {
        cloudData.attendance.forEach((r: AttendanceRecord) => mergedAttendanceMap.set(r.id, r));
      }
      localAttendance.forEach(r => mergedAttendanceMap.set(r.id, r));
      const mergedAttendance = Array.from(mergedAttendanceMap.values());

      // Update Local Storage with Merged Data
      localStorage.setItem(USERS_KEY, JSON.stringify(mergedUsers));
      localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(mergedAttendance));

      // --- STEP 3: PUSH (POST) ---
      // Send the fully merged dataset back to the cloud
      const finalPayload = {
        users: mergedUsers,
        attendance: mergedAttendance,
        lastSync: new Date().toISOString()
      };

      const postResponse = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(finalPayload),
        headers: { "Content-Type": "text/plain" },
        redirect: 'follow',
        credentials: 'omit' 
      });

      if (!postResponse.ok) {
           return { success: false, message: `Cloud update failed: ${postResponse.status}` };
      }

      return { success: true, message: "Sync Complete (Data Restored & Saved)." };

    } catch (error: any) {
      console.error("Sync Error:", error);
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
          return { success: false, message: "Sync Failed: Permission Error. Ensure Script is deployed as 'Anyone'." };
      }
      return { success: false, message: `Network error: ${error.message || 'Unknown'}` };
    }
  },

  exportToCSV: () => {
    const records = StorageService.getAttendance();
    const headers = [
      'Employee_ID', 
      'Name', 
      'Department', 
      'Date', 
      'Work_Mode',
      'Check_In_Time', 
      'Check_Out_Time', 
      'Total_Hours', 
      'Status',
      'Check_In_LatLong', 
      'Check_Out_LatLong'
    ];
    
    const csvContent = [
      headers.join(','),
      ...records.map(r => {
        const hours = r.totalDurationMinutes ? (r.totalDurationMinutes / 60).toFixed(2) : '0';
        return [
          r.employeeId,
          `"${r.employeeName}"`,
          r.department,
          r.date,
          r.workMode,
          new Date(r.checkInTime).toLocaleTimeString(),
          r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString() : 'N/A',
          hours,
          r.status,
          `"${r.checkInLocation || ''}"`,
          `"${r.checkOutLocation || ''}"`
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `MyCoHarvest_Attendance_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
};