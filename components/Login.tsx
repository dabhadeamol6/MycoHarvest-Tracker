import React, { useState } from 'react';
import { User } from '../types';
import { StorageService } from '../services/storage';
import { Building2, Lock, UserCircle, AlertTriangle, Loader2 } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Simulate network delay for better UX
    setTimeout(() => {
        attemptLogin(email, password);
        // Only turn off loading if there was an error, otherwise component unmounts
    }, 800);
  };

  const attemptLogin = (emailInput: string, passwordInput: string) => {
    // 1. Domain Validation
    if (!emailInput.toLowerCase().endsWith('@mycoharvest.in')) {
      setError('Access Restricted: Only @mycoharvest.in email addresses are allowed.');
      setIsLoading(false);
      return;
    }

    const users = StorageService.getUsers();
    const user = users.find(u => u.email.toLowerCase() === emailInput.toLowerCase());

    // 2. User Existence & Password Validation
    if (user) {
      if (user.password === passwordInput) {
        onLogin(user);
        // Loading stays true while component unmounts/transitions
      } else {
        setError('Invalid credentials. Please check your password.');
        setIsLoading(false);
      }
    } else {
      setError('User not found. Please contact the administrator.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-emerald-600 p-8 text-center">
            <div className="flex justify-center mb-4">
                <div className="p-3 bg-white/20 backdrop-blur-sm rounded-full">
                    <Building2 className="w-10 h-10 text-white" />
                </div>
            </div>
            <h1 className="text-2xl font-bold text-white">MyCoHarvest</h1>
            <p className="text-emerald-100 text-sm">Attendance & Operations</p>
        </div>

        <div className="p-8">
            <form onSubmit={handleLogin} className="space-y-5">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                Official Email ID
                </label>
                <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserCircle className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="email"
                    required
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 outline-none transition disabled:opacity-50"
                    placeholder="name@mycoharvest.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
                </label>
                <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="password"
                    required
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 outline-none transition disabled:opacity-50"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                />
                </div>
            </div>

            {error && (
                <div className="flex items-start bg-red-50 p-3 rounded-lg animate-fade-in">
                    <AlertTriangle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{error}</p>
                </div>
            )}

            <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors disabled:bg-slate-700 disabled:cursor-not-allowed"
            >
                {isLoading ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                    </>
                ) : (
                    "Login to Portal"
                )}
            </button>
            </form>
        </div>
      </div>
    </div>
  );
};
