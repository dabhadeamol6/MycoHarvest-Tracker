import { GoogleGenAI } from "@google/genai";
import { AttendanceRecord, User } from "../types";

const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.warn("API Key not found in environment variables");
        return null;
    }
    return new GoogleGenAI({ apiKey });
}

export const GeminiService = {
  analyzeAttendance: async (records: AttendanceRecord[], users: User[], query?: string) => {
    const client = getClient();
    if (!client) return "AI service unavailable. Please check API Key configuration.";

    const todayStr = new Date().toISOString().split('T')[0];
    const todaysRecords = records.filter(r => r.date === todayStr);
    
    // Prepare a summarized dataset to avoid token limits
    const summary = {
      totalEmployees: users.length,
      todayStats: {
        present: todaysRecords.length,
        absent: users.length - todaysRecords.length,
        late: todaysRecords.filter(r => r.status === 'LATE').length
      },
      recentRecords: records.slice(-20).map(r => ({
        name: r.employeeName,
        date: r.date,
        hours: r.totalDurationMinutes ? (r.totalDurationMinutes/60).toFixed(1) : 'Active',
        status: r.status
      }))
    };

    const prompt = `
      You are an HR Analytics AI for "OfficeRoute". 
      Here is the current attendance summary JSON: ${JSON.stringify(summary)}.
      
      User Query: "${query || "Provide a brief executive summary of today's attendance and any concerning trends from the recent records."}"
      
      Keep the response concise, professional, and actionable. 
      If looking for trends, look for repeated lateness or long working hours.
      Format with markdown.
    `;

    try {
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text;
    } catch (error) {
      console.error("Gemini Error:", error);
      return "Unable to generate insights at this time.";
    }
  }
};
