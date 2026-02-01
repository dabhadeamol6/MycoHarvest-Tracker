import React, { useState, useEffect, useMemo } from 'react';
import { User, UserRole, AttendanceRecord, LocationConfig } from '../types';
import { StorageService } from '../services/storage';
import { GeminiService } from '../services/geminiService';
import { 
  LogOut, 
  MapPin, 
  Clock, 
  Download, 
  Users, 
  LayoutDashboard, 
  CalendarDays,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Menu,
  X,
  UserPlus,
  Home,
  Building,
  Briefcase,
  Search,
  ArrowUpDown,
  Cloud,
  RefreshCw,
  Settings,
  ChevronRight,
  ChevronDown,
  Info,
  Laptop,
  Pencil
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

// Haversine formula to calculate distance in meters
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
};

export const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'employees'>('dashboard');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [currentRecord, setCurrentRecord] = useState<AttendanceRecord | undefined>(undefined);
  const [locationLoading, setLocationLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // New States
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [workMode, setWorkMode] = useState<'OFFICE' | 'HOME'>('OFFICE');
  const [geoError, setGeoError] = useState<string | null>(null);

  // Employee Table States
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof User; direction: 'asc' | 'desc' } | null>(null);

  // Load data
  useEffect(() => {
    refreshData();
  }, [user]);

  const refreshData = () => {
    const data = StorageService.getAttendance();
    const users = StorageService.getUsers();
    setAttendance(data);
    setAllUsers(users);

    const todayStr = new Date().toISOString().split('T')[0];
    const todayRecord = data.find(r => r.userId === user.id && r.date === todayStr);
    setCurrentRecord(todayRecord);
  };

  const getCoordinates = (): Promise<{lat: number, lng: number}> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const handleCheckIn = async () => {
    setGeoError(null);
    setLocationLoading(true);

    try {
      // Logic split: WFH vs Office
      let locationString = "";
      
      if (workMode === 'HOME') {
          // Check for WFH permission
          const isAllowedWFH = user.allowedLocations.some(l => l.type === 'HOME');
          if (!isAllowedWFH) {
              setGeoError("Access Denied: You are not authorized for Work From Home. Please contact Admin.");
              setLocationLoading(false);
              return;
          }
          // No GPS check for Home
          locationString = "Remote (WFH)";
      } else {
          // Office: Require GPS Check
          try {
              const coords = await getCoordinates();
              const allowedLoc = user.allowedLocations.find(l => l.type === 'OFFICE');
              
              if (allowedLoc) {
                const distance = calculateDistance(coords.lat, coords.lng, allowedLoc.latitude, allowedLoc.longitude);
                if (distance > allowedLoc.radiusMeters) {
                    setGeoError(`You are ${Math.round(distance)}m away from Office. Max allowed: ${allowedLoc.radiusMeters}m.`);
                    setLocationLoading(false);
                    return;
                }
              }
              locationString = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
          } catch (e) {
              setGeoError("Could not fetch location for Office Check-in. GPS is required.");
              setLocationLoading(false);
              return;
          }
      }

      const now = new Date();
      const isLate = now.getHours() > 9; // Late if after 9 AM

      const newRecord: AttendanceRecord = {
        id: crypto.randomUUID(),
        userId: user.id,
        employeeId: user.employeeId,
        employeeName: user.name,
        department: user.department,
        date: now.toISOString().split('T')[0],
        checkInTime: now.toISOString(),
        checkInLocation: locationString,
        workMode: workMode,
        status: isLate ? 'LATE' : 'PRESENT'
      };

      StorageService.saveAttendanceRecord(newRecord);
      refreshData();
      
      // Attempt Auto Sync if configured
      if (StorageService.getCloudUrl()) {
        StorageService.syncData();
      }

    } catch (err) {
      setGeoError("An unexpected error occurred.");
    } finally {
      setLocationLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!currentRecord) return;
    setLocationLoading(true);
    
    try {
        let locationString = "Remote (WFH)";
        
        // Only fetch GPS for checkout if in Office mode, though generally checkout is lenient.
        // For consistency, let's try to get it if possible, but fallback to "Unknown" if remote/error
        if (workMode === 'OFFICE') {
             try {
                 const coords = await getCoordinates();
                 locationString = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
             } catch (e) {
                 locationString = "Location unavailable";
             }
        }
        
        const now = new Date();
        const checkInTime = new Date(currentRecord.checkInTime);
        const durationMs = now.getTime() - checkInTime.getTime();
        const durationMinutes = Math.floor(durationMs / 60000);

        const updatedRecord: AttendanceRecord = {
            ...currentRecord,
            checkOutTime: now.toISOString(),
            checkOutLocation: locationString,
            totalDurationMinutes: durationMinutes
        };

        StorageService.saveAttendanceRecord(updatedRecord);
        refreshData();
        
        // Attempt Auto Sync if configured
        if (StorageService.getCloudUrl()) {
            StorageService.syncData();
        }
    } catch(err) {
        setGeoError("Could not checkout.");
    } finally {
        setLocationLoading(false);
    }
  };

  const fetchAIInsights = async () => {
    setAiLoading(true);
    const insight = await GeminiService.analyzeAttendance(attendance, allUsers);
    setAiInsight(insight);
    setAiLoading(false);
  };

  const handleEditUser = (userToEdit: User) => {
      setEditingUser(userToEdit);
      setShowUserModal(true);
  };

  const handleAddUser = () => {
      setEditingUser(null);
      setShowUserModal(true);
  };

  // --- Sorting & Filtering Logic ---
  const handleSort = (key: keyof User) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredUsers = useMemo(() => {
    let data = [...allUsers];
    if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        data = data.filter(user => 
            user.name.toLowerCase().includes(lowerTerm) ||
            user.email.toLowerCase().includes(lowerTerm) ||
            user.department.toLowerCase().includes(lowerTerm) ||
            (user.employeeId && user.employeeId.toLowerCase().includes(lowerTerm)) ||
            user.role.toLowerCase().includes(lowerTerm)
        );
    }
    if (sortConfig) {
        data.sort((a, b) => {
             const aValue = String(a[sortConfig.key] || '').toLowerCase();
             const bValue = String(b[sortConfig.key] || '').toLowerCase();
             if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
             if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
             return 0;
        });
    }
    return data;
  }, [allUsers, searchTerm, sortConfig]);

  // --- Sync Modal ---
  const SyncModal = () => {
      const [url, setUrl] = useState(StorageService.getCloudUrl());
      const [status, setStatus] = useState('');
      const [isSyncing, setIsSyncing] = useState(false);
      const [showInstructions, setShowInstructions] = useState(false);

      const handleSave = () => {
          const trimmedUrl = url.trim();
          if (!trimmedUrl.includes('script.google.com')) {
               setStatus('Error: Invalid URL. Must be a Google Apps Script Web App URL.');
               return;
          }
          StorageService.setCloudUrl(trimmedUrl);
          setStatus('URL Saved.');
          setTimeout(() => setStatus(''), 2000);
      };

      const handleSync = async () => {
          setIsSyncing(true);
          setStatus('Syncing (Restoring & Saving)...');
          const result = await StorageService.syncData();
          setStatus(result.message);
          setIsSyncing(false);
          if (result.success) refreshData();
      };

      const scriptCode = `
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Database');
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Database');
  }
  
  // Store the raw JSON data in cell A1. 
  // For a real production app, you would parse this and insert into rows.
  // This simple method ensures specific app state is preserved perfectly.
  sheet.getRange('A1').setValue(e.postData.contents);
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success', 
    data: JSON.parse(e.postData.contents)
  })).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Database');
  var data = {};
  if (sheet) {
    var val = sheet.getRange('A1').getValue();
    if (val) data = JSON.parse(val);
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    data: data
  })).setMimeType(ContentService.MimeType.JSON);
}
      `.trim();

      return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center">
                        <Cloud className="w-6 h-6 mr-2 text-blue-500" />
                        Google Sheets Cloud Sync
                    </h2>
                    <button onClick={() => setShowSyncModal(false)}><X className="text-slate-500" /></button>
                </div>
                
                <div className="p-6 space-y-6">
                    <p className="text-sm text-slate-600">
                        Connect this app to a Google Sheet to store data in the cloud.
                    </p>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">Google Apps Script Web App URL</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="https://script.google.com/macros/s/.../exec" 
                                className="flex-1 border p-2 rounded text-sm font-mono"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                            />
                            <button onClick={handleSave} className="bg-slate-800 text-white px-4 py-2 rounded text-sm">Save</button>
                        </div>
                        <p className="text-xs text-slate-500">Must start with <span className="font-mono">https://script.google.com/</span></p>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                        <button 
                            onClick={() => setShowInstructions(!showInstructions)}
                            className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition"
                        >
                            <span className="font-semibold text-sm text-slate-700">How to set up (Click to expand)</span>
                            {showInstructions ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        
                        {showInstructions && (
                            <div className="p-4 bg-slate-50 border-t text-sm space-y-3">
                                <ol className="list-decimal pl-5 space-y-2 text-slate-600">
                                    <li>Create a new <strong>Google Sheet</strong> (e.g., "OfficeRoute Data").</li>
                                    <li>Go to <strong>Extensions</strong> &gt; <strong>Apps Script</strong>.</li>
                                    <li>Delete existing code and paste the code below.</li>
                                    <li>Click <strong>Deploy</strong> &gt; <strong>New Deployment</strong>.</li>
                                    <li>Select type: <strong>Web App</strong>.</li>
                                    <li>
                                        Set <em>Who has access</em> to: <strong className="text-red-600 bg-red-50 px-1 rounded">Anyone</strong> 
                                        <div className="mt-1 text-xs text-red-600 flex items-center">
                                            <Info className="w-3 h-3 mr-1"/>
                                            CRITICAL: If not set to "Anyone", sync will fail with "Network Error".
                                        </div>
                                    </li>
                                    <li>Click <strong>Deploy</strong> and copy the <strong>Web App URL</strong>.</li>
                                    <li>Paste the URL in the box above.</li>
                                </ol>
                                <div className="relative group mt-2">
                                    <pre className="bg-slate-800 text-slate-200 p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                                        {scriptCode}
                                    </pre>
                                    <button 
                                        onClick={() => navigator.clipboard.writeText(scriptCode)}
                                        className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded text-xs"
                                    >
                                        Copy Code
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t">
                        <span className={`text-sm font-medium ${
                            status.includes('Error') || status.includes('Fail') || status.includes('Invalid') 
                            ? 'text-red-600' 
                            : 'text-emerald-600'
                        }`}>
                            {status}
                        </span>
                        <button 
                            onClick={handleSync}
                            disabled={!url || isSyncing}
                            className={`flex items-center px-6 py-2 rounded-lg text-white font-medium transition ${!url ? 'bg-slate-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            {isSyncing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
                            Sync Now
                        </button>
                    </div>
                </div>
            </div>
        </div>
      );
  };

  // --- Add/Edit Employee Modal ---
  const EmployeeModal = () => {
    // Initialize form state based on editingUser if it exists
    const [formData, setFormData] = useState({
        name: editingUser?.name || '',
        employeeId: editingUser?.employeeId || '',
        email: editingUser?.email || '',
        gender: editingUser?.gender || 'Select',
        department: editingUser?.department || '',
        position: editingUser?.position || '',
        password: editingUser?.password || 'Mycoharvest@12345',
        role: editingUser?.role || UserRole.USER,
        officeLat: editingUser?.allowedLocations.find(l => l.type === 'OFFICE')?.latitude.toString() || '',
        officeLng: editingUser?.allowedLocations.find(l => l.type === 'OFFICE')?.longitude.toString() || '',
        isWFHAllowed: editingUser?.allowedLocations.some(l => l.type === 'HOME') || false
    });

    const fillCurrentLocation = async () => {
        try {
            const pos = await getCoordinates();
            setFormData(prev => ({ ...prev, officeLat: pos.lat.toString(), officeLng: pos.lng.toString() }));
        } catch(e) {
            alert("Could not fetch location");
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.email.endsWith('@mycoharvest.in')) {
            alert("Email must end with @mycoharvest.in");
            return;
        }

        const allowedLocations: LocationConfig[] = [];
        
        // Add Office
        if (formData.officeLat && formData.officeLng) {
            allowedLocations.push({
                type: 'OFFICE',
                latitude: parseFloat(formData.officeLat),
                longitude: parseFloat(formData.officeLng),
                radiusMeters: 500
            });
        } else {
             // Default Pune Office if empty
             allowedLocations.push({
                type: 'OFFICE',
                latitude: 18.5204,
                longitude: 73.8567,
                radiusMeters: 500
            });
        }

        // Add Home/WFH Permission
        if (formData.isWFHAllowed) {
            allowedLocations.push({
                type: 'HOME',
                latitude: 0, 
                longitude: 0,
                radiusMeters: 0
            });
        }

        const userData: User = {
            id: editingUser ? editingUser.id : crypto.randomUUID(),
            employeeId: formData.employeeId,
            name: formData.name,
            email: formData.email,
            password: formData.password,
            department: formData.department,
            position: formData.position,
            role: formData.role,
            gender: formData.gender,
            joinedDate: editingUser ? editingUser.joinedDate : new Date().toISOString().split('T')[0],
            allowedLocations
        };

        if (editingUser) {
            StorageService.updateUser(userData);
        } else {
            StorageService.addUser(userData);
        }

        refreshData();
        setShowUserModal(false);
        // Trigger auto sync
        if (StorageService.getCloudUrl()) {
             StorageService.syncData();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
                    <h2 className="text-xl font-bold text-slate-800">{editingUser ? 'Edit Employee' : 'Add New Employee'}</h2>
                    <button onClick={() => setShowUserModal(false)}><X className="text-slate-500" /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                            <input required type="text" className="w-full border p-2 rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                            <input required type="text" placeholder="MH-XXX" className="w-full border p-2 rounded" value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Official Email</label>
                            <input required type="email" placeholder="@mycoharvest.in" className="w-full border p-2 rounded" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                            <input required type="text" className="w-full border p-2 rounded" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                            <input required type="text" className="w-full border p-2 rounded" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                            <input required type="text" className="w-full border p-2 rounded" value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                            <select className="w-full border p-2 rounded" value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}>
                                <option>Select</option>
                                <option>Male</option>
                                <option>Female</option>
                                <option>Other</option>
                            </select>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">System Role</label>
                            <select className="w-full border p-2 rounded" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                                <option value={UserRole.USER}>User</option>
                                <option value={UserRole.ADMIN}>Admin</option>
                            </select>
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <h3 className="font-semibold text-slate-800 mb-3 flex items-center"><MapPin className="w-4 h-4 mr-2" /> Geolocation & Remote Work</h3>
                        
                        <div className="bg-slate-50 p-4 rounded-lg mb-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-medium text-emerald-700">Office Location (Lat/Long)</label>
                                <button type="button" onClick={fillCurrentLocation} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200">Set Current Location</button>
                            </div>
                            <div className="flex gap-2">
                                <input placeholder="Latitude" className="w-full border p-2 rounded text-sm" value={formData.officeLat} onChange={e => setFormData({...formData, officeLat: e.target.value})} />
                                <input placeholder="Longitude" className="w-full border p-2 rounded text-sm" value={formData.officeLng} onChange={e => setFormData({...formData, officeLng: e.target.value})} />
                            </div>
                        </div>

                         <div className="bg-slate-50 p-4 rounded-lg flex items-center justify-between">
                            <div>
                                <label className="block text-sm font-medium text-blue-700">Remote Work Authorization</label>
                                <p className="text-xs text-slate-500">Allow this employee to Work From Home without GPS validation.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={formData.isWFHAllowed}
                                    onChange={e => setFormData({...formData, isWFHAllowed: e.target.checked})}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setShowUserModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                            {editingUser ? 'Update Employee' : 'Create Employee'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
  };

  // --- Render Functions ---

  const renderUserSidebar = () => (
    <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
      <div className="p-6 border-b border-slate-800 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">MyCoHarvest</h2>
          <p className="text-xs text-slate-400">
             {user.role === UserRole.ADMIN ? 'Admin Portal' : 'Employee Portal'}
          </p>
        </div>
        <button className="md:hidden" onClick={() => setMobileMenuOpen(false)}>
            <X className="w-6 h-6" />
        </button>
      </div>
      <nav className="p-4 space-y-2">
        <button 
          onClick={() => { setActiveTab('dashboard'); setMobileMenuOpen(false); }}
          className={`flex items-center w-full p-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <LayoutDashboard className="w-5 h-5 mr-3" />
          Dashboard
        </button>
        {user.role === UserRole.USER && (
            <button 
            onClick={() => { setActiveTab('history'); setMobileMenuOpen(false); }}
            className={`flex items-center w-full p-3 rounded-lg transition-colors ${activeTab === 'history' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
            >
            <CalendarDays className="w-5 h-5 mr-3" />
            My Attendance
            </button>
        )}
        {user.role === UserRole.ADMIN && (
          <>
            <button 
                onClick={() => { setActiveTab('employees'); setMobileMenuOpen(false); }}
                className={`flex items-center w-full p-3 rounded-lg transition-colors ${activeTab === 'employees' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
            >
                <Users className="w-5 h-5 mr-3" />
                Employee Management
            </button>
             <button 
                onClick={() => { setShowSyncModal(true); setMobileMenuOpen(false); }}
                className="flex items-center w-full p-3 rounded-lg transition-colors hover:bg-slate-800 text-blue-300"
            >
                <Cloud className="w-5 h-5 mr-3" />
                Cloud Sync
            </button>
          </>
        )}
      </nav>
      <div className="absolute bottom-0 w-full p-6 border-t border-slate-800">
        <div className="flex items-center mb-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-lg font-bold">
            {user.name.charAt(0)}
          </div>
          <div className="ml-3 overflow-hidden">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
        </div>
        <button onClick={onLogout} className="flex items-center text-sm text-red-400 hover:text-red-300">
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </button>
      </div>
    </div>
  );

  const renderCheckInCard = () => {
    // Admins do not check in
    if (user.role === UserRole.ADMIN) return null;

    const isCheckedIn = !!currentRecord;
    const isCheckedOut = !!currentRecord?.checkOutTime;
    
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-500 to-teal-600"></div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </h2>
        <p className="text-slate-500 mb-6 font-mono text-xl">
          {new Date().toLocaleTimeString()}
        </p>
        
        {/* Work Mode Selector */}
        {!isCheckedIn && (
            <div className="flex justify-center gap-4 mb-8">
                <button 
                    onClick={() => setWorkMode('OFFICE')}
                    className={`flex items-center px-4 py-2 rounded-lg border-2 transition ${workMode === 'OFFICE' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500 hover:border-emerald-200'}`}
                >
                    <Building className="w-4 h-4 mr-2" />
                    Office
                </button>
                 <button 
                    onClick={() => setWorkMode('HOME')}
                    className={`flex items-center px-4 py-2 rounded-lg border-2 transition ${workMode === 'HOME' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-blue-200'}`}
                >
                    <Home className="w-4 h-4 mr-2" />
                    Work From Home
                </button>
            </div>
        )}

        {/* Error Message */}
        {geoError && (
            <div className="mb-6 mx-auto max-w-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start text-left">
                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{geoError}</p>
            </div>
        )}

        <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
            {/* Check In Button */}
            {!isCheckedIn ? (
                <button
                onClick={handleCheckIn}
                disabled={locationLoading}
                className={`group relative flex flex-col items-center justify-center w-48 h-48 rounded-full text-white shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 disabled:opacity-70 disabled:hover:scale-100 ${workMode === 'OFFICE' ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}
                >
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 rounded-full transition-opacity"></div>
                {locationLoading ? (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
                ) : (
                    <MapPin className="w-10 h-10 mb-2" />
                )}
                <span className="text-lg font-bold">Check In</span>
                <span className="text-xs opacity-90 mt-1">{workMode === 'OFFICE' ? 'At Office' : 'Remote'}</span>
                </button>
            ) : (
                <div className="w-48 h-48 rounded-full border-4 border-emerald-100 flex flex-col items-center justify-center bg-emerald-50 text-emerald-800">
                    <CheckCircle2 className="w-8 h-8 mb-1" />
                    <span className="text-sm font-semibold">Checked In</span>
                    <span className="text-xs text-gray-500 mt-1">{new Date(currentRecord.checkInTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider mt-1 px-2 py-0.5 bg-white rounded-full border border-emerald-100">{currentRecord.workMode}</span>
                </div>
            )}

            {/* Connecting Line (Desktop) */}
            <div className="hidden md:block w-16 h-1 bg-slate-100 rounded-full"></div>

            {/* Check Out Button */}
            {isCheckedIn && !isCheckedOut ? (
                <button
                onClick={handleCheckOut}
                disabled={locationLoading}
                className="group relative flex flex-col items-center justify-center w-48 h-48 rounded-full bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 disabled:opacity-70 disabled:hover:scale-100"
                >
                {locationLoading ? (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
                ) : (
                    <LogOut className="w-10 h-10 mb-2" />
                )}
                <span className="text-lg font-bold">Check Out</span>
                <span className="text-xs opacity-90 mt-1">End Workday</span>
                </button>
            ) : (
                <div className={`w-48 h-48 rounded-full border-4 flex flex-col items-center justify-center ${isCheckedOut ? 'border-slate-200 bg-slate-50 text-slate-800' : 'border-dashed border-slate-200 text-slate-400'}`}>
                    {isCheckedOut ? (
                        <>
                            <CheckCircle2 className="w-8 h-8 mb-1 text-slate-600" />
                            <span className="text-sm font-semibold">Done for Today</span>
                            <span className="text-xs text-gray-500 mt-1">{currentRecord.totalDurationMinutes ? (currentRecord.totalDurationMinutes/60).toFixed(1) + ' hrs' : ''}</span>
                        </>
                    ) : (
                        <span className="text-sm">Not Checked Out</span>
                    )}
                </div>
            )}
        </div>
      </div>
    );
  };

  const renderAdminWidgets = () => {
    // Basic stats calculation
    const todayStr = new Date().toISOString().split('T')[0];
    const todaysRecords = attendance.filter(r => r.date === todayStr);
    const presentCount = todaysRecords.length;
    const lateCount = todaysRecords.filter(r => r.status === 'LATE').length;
    // Admins are not counted in absenteeism usually, assuming filteredUsers doesn't include admin or we handle it.
    // Ideally filter out admins from stats if they don't check in.
    const employeeUsers = allUsers.filter(u => u.role !== UserRole.ADMIN);
    const absentCount = employeeUsers.length - presentCount;

    const pieData = [
      { name: 'Present', value: presentCount, color: '#10b981' }, // emerald-500
      { name: 'Late', value: lateCount, color: '#f59e0b' }, // amber-500
      { name: 'Absent', value: Math.max(0, absentCount), color: '#ef4444' } // red-500
    ];

    return (
      <div className="space-y-6">
        {/* Top Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-slate-500">Total Employees</p>
                <h3 className="text-2xl font-bold text-slate-800">{employeeUsers.length}</h3>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <Users className="w-5 h-5" />
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
             <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-slate-500">Present Today</p>
                <h3 className="text-2xl font-bold text-emerald-600">{presentCount}</h3>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
             <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-slate-500">Late Arrivals</p>
                <h3 className="text-2xl font-bold text-amber-600">{lateCount}</h3>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <Clock className="w-5 h-5" />
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
             <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-slate-500">Absent</p>
                <h3 className="text-2xl font-bold text-red-600">{Math.max(0, absentCount)}</h3>
              </div>
              <div className="p-2 bg-red-50 rounded-lg text-red-600">
                <AlertCircle className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
                <h3 className="text-lg font-semibold mb-4 text-slate-800">Weekly Attendance Trends</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                            { name: 'Mon', count: Math.floor(employeeUsers.length * 0.9) },
                            { name: 'Tue', count: Math.floor(employeeUsers.length * 0.85) },
                            { name: 'Wed', count: Math.floor(employeeUsers.length * 0.95) },
                            { name: 'Thu', count: Math.floor(employeeUsers.length * 0.8) },
                            { name: 'Fri', count: presentCount }
                        ]}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} />
                            <YAxis axisLine={false} tickLine={false} />
                            <Tooltip cursor={{fill: 'transparent'}} />
                            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                 <h3 className="text-lg font-semibold mb-4 text-slate-800">Today's Split</h3>
                 <div className="h-64 flex justify-center items-center">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieData}
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                    </ResponsiveContainer>
                 </div>
            </div>
        </div>

        {/* AI Insight Section */}
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-6 rounded-xl border border-indigo-100">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                    <Sparkles className="w-5 h-5 text-indigo-600 mr-2" />
                    <h3 className="text-lg font-semibold text-indigo-900">AI Insights</h3>
                </div>
                <button 
                    onClick={fetchAIInsights}
                    disabled={aiLoading}
                    className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition"
                >
                    {aiLoading ? 'Analyzing...' : 'Refresh Analysis'}
                </button>
            </div>
            <div className="prose prose-sm text-indigo-800 max-w-none">
                {aiInsight ? (
                    <div className="whitespace-pre-wrap">{aiInsight}</div>
                ) : (
                    <p className="text-indigo-600 opacity-70 italic">Click refresh to let Gemini AI analyze attendance patterns, lateness trends, and missing hours.</p>
                )}
            </div>
        </div>
        
        {/* Attendance Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-slate-800">Recent Activity</h3>
                <div className="flex gap-2">
                    <button 
                        onClick={() => StorageService.getCloudUrl() ? StorageService.syncData().then(r => alert(r.message)) : setShowSyncModal(true)} 
                        className="flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Sync Cloud
                    </button>
                    <button onClick={StorageService.exportToCSV} className="flex items-center text-sm text-emerald-600 hover:text-emerald-800 font-medium">
                        <Download className="w-4 h-4 mr-1" />
                        Export CSV
                    </button>
                </div>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th className="px-6 py-4">Employee</th>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4">Mode</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">In / Out</th>
                            <th className="px-6 py-4">Duration</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {attendance.slice(0, 10).map((record) => (
                            <tr key={record.id} className="hover:bg-slate-50 transition">
                                <td className="px-6 py-4">
                                    <div className="font-medium text-slate-800">{record.employeeName}</div>
                                    <div className="text-xs text-slate-400">{record.department}</div>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-600">{record.date}</td>
                                <td className="px-6 py-4">
                                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${record.workMode === 'HOME' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {record.workMode || 'OFFICE'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        record.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-800' :
                                        record.status === 'LATE' ? 'bg-amber-100 text-amber-800' :
                                        'bg-gray-100 text-gray-800'
                                    }`}>
                                        {record.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-600">
                                    <div className="flex flex-col">
                                        <span>In: {new Date(record.checkInTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        {record.checkOutTime && <span className="text-slate-400">Out: {new Date(record.checkOutTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-600">
                                    {record.totalDurationMinutes ? (record.totalDurationMinutes/60).toFixed(1) + ' hrs' : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
        </div>
      </div>
    );
  };

  const renderUserWidgets = () => {
    const myRecords = attendance.filter(r => r.userId === user.id);
    const todayStr = new Date().toISOString().split('T')[0];
    const monthStr = todayStr.substring(0, 7); 
    
    const thisMonth = myRecords.filter(r => r.date.startsWith(monthStr));
    const totalHours = thisMonth.reduce((acc, r) => acc + (r.totalDurationMinutes || 0), 0) / 60;
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <p className="text-slate-500 text-sm font-medium">Days Present (This Month)</p>
                <h3 className="text-3xl font-bold text-emerald-600 mt-2">{thisMonth.length}</h3>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <p className="text-slate-500 text-sm font-medium">Total Hours (This Month)</p>
                <h3 className="text-3xl font-bold text-blue-600 mt-2">{totalHours.toFixed(1)}</h3>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <p className="text-slate-500 text-sm font-medium">Lates (This Month)</p>
                <h3 className="text-3xl font-bold text-amber-600 mt-2">{thisMonth.filter(r => r.status === 'LATE').length}</h3>
            </div>
        </div>
    );
  };

  const renderHistoryTab = () => {
    const myRecords = attendance.filter(r => r.userId === user.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return (
        <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">My Attendance History</h2>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4">Mode</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Check In</th>
                            <th className="px-6 py-4">Check Out</th>
                            <th className="px-6 py-4">Hours</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {myRecords.map((record) => (
                            <tr key={record.id} className="hover:bg-slate-50 transition">
                                <td className="px-6 py-4 text-sm font-medium text-slate-800">{record.date}</td>
                                <td className="px-6 py-4">
                                     <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${record.workMode === 'HOME' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {record.workMode || 'OFFICE'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        record.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-800' :
                                        record.status === 'LATE' ? 'bg-amber-100 text-amber-800' :
                                        'bg-gray-100 text-gray-800'
                                    }`}>
                                        {record.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-600">
                                    {new Date(record.checkInTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-600">
                                    {record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-600">
                                    {record.totalDurationMinutes ? (record.totalDurationMinutes/60).toFixed(1) : '-'}
                                </td>
                            </tr>
                        ))}
                         {myRecords.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">No attendance records found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
                </div>
            </div>
        </div>
    );
  };

  const renderEmployeeManagement = () => {
       return (
           <div className="max-w-6xl mx-auto space-y-6">
               <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                   <h2 className="text-2xl font-bold text-slate-800">Employee Management</h2>
                   <div className="flex gap-2 w-full md:w-auto">
                       <div className="relative flex-1 md:w-64">
                           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                           <input 
                                type="text" 
                                placeholder="Search employees..." 
                                className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                           />
                       </div>
                       <button 
                            onClick={handleAddUser}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center text-sm font-medium transition"
                       >
                           <UserPlus className="w-4 h-4 mr-2" />
                           Add Employee
                       </button>
                   </div>
               </div>
               
               <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition" onClick={() => handleSort('employeeId')}>
                                        <div className="flex items-center">ID <ArrowUpDown className="w-3 h-3 ml-1" /></div>
                                    </th>
                                    <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition" onClick={() => handleSort('name')}>
                                        <div className="flex items-center">Name <ArrowUpDown className="w-3 h-3 ml-1" /></div>
                                    </th>
                                    <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition" onClick={() => handleSort('department')}>
                                        <div className="flex items-center">Department <ArrowUpDown className="w-3 h-3 ml-1" /></div>
                                    </th>
                                    <th className="px-6 py-4">Role</th>
                                    <th className="px-6 py-4">Joined</th>
                                    <th className="px-6 py-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredUsers.map((u) => (
                                    <tr key={u.id} className="hover:bg-slate-50 transition group">
                                        <td className="px-6 py-4 text-sm font-mono text-slate-600">{u.employeeId}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold mr-3 text-slate-600">
                                                    {u.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-slate-800">{u.name}</div>
                                                    <div className="text-xs text-slate-400">{u.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {u.department}
                                            <div className="text-xs text-slate-400">{u.position}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${u.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{u.joinedDate}</td>
                                        <td className="px-6 py-4">
                                            <button 
                                                onClick={() => handleEditUser(u)}
                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center opacity-70 group-hover:opacity-100 transition"
                                            >
                                                <Pencil className="w-3 h-3 mr-1" />
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredUsers.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-slate-500">No employees found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
               </div>
           </div>
       );
  };

  const renderContent = () => {
    switch (activeTab) {
        case 'dashboard':
            return (
                <div className="max-w-6xl mx-auto space-y-8">
                     <div className="flex justify-between items-end">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Welcome back, {user.name.split(' ')[0]} 👋</h1>
                            <p className="text-slate-500 mt-1">
                                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                     </div>
    
                     {renderCheckInCard()}
    
                     {user.role === UserRole.ADMIN ? renderAdminWidgets() : renderUserWidgets()}
                </div>
            );
        case 'history':
            return renderHistoryTab();
        case 'employees':
            return renderEmployeeManagement();
        default:
            return null;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {renderUserSidebar()}
      
      {/* Mobile Header */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden bg-white shadow-sm p-4 flex justify-between items-center z-40">
            <span className="font-bold text-lg text-slate-800">MyCoHarvest</span>
            <button onClick={() => setMobileMenuOpen(true)}>
                <Menu className="w-6 h-6 text-slate-600" />
            </button>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8">
            {renderContent()}
        </main>
      </div>

      {showUserModal && <EmployeeModal />}
      {showSyncModal && <SyncModal />}
    </div>
  );
};