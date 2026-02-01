export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export interface LocationConfig {
  type: 'OFFICE' | 'HOME';
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface User {
  id: string; // Internal UUID
  employeeId: string; // Company ID (e.g., MH-001)
  name: string;
  email: string;
  password?: string; // In a real app, this should be hashed. Plain text for demo only.
  role: UserRole;
  department: string;
  position: string;
  gender: string;
  joinedDate: string;
  allowedLocations: LocationConfig[];
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string; // YYYY-MM-DD
  checkInTime: string; // ISO String
  checkOutTime?: string; // ISO String
  checkInLocation?: string;
  checkOutLocation?: string;
  workMode: 'OFFICE' | 'HOME';
  totalDurationMinutes?: number;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY';
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}
