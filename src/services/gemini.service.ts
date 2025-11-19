
import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { Todo, Week, CategoryKey } from '../models/todo.model';

// The execution environment is expected to provide process.env.API_KEY.
declare let process: any;

export interface SchedulingPlanItem {
    id: number;
    day: string;
    category: CategoryKey;
}

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    try {
        if (typeof process !== 'undefined' && process.env?.API_KEY) {
            this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        } else {
            console.error('Gemini API key not found. Please ensure API_KEY is set in environment variables.');
        }
    } catch (e) {
        console.error('Failed to initialize GoogleGenAI:', e);
    }
  }

  async getSchedulingPlan(
    tasks: Todo[], 
    currentWeek: Week,
    dailyLoad: Record<string, { total: number }>
  ): Promise<SchedulingPlanItem[] | null> {
    if (!this.ai) {
        console.error("Gemini AI client not initialized.");
        alert("AI Service is not configured. Please check the console for details.");
        return null;
    }

    const prompt = this.createPrompt(tasks, dailyLoad);
    const schema = this.createResponseSchema();

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.2,
        },
      });

      const jsonString = response.text.trim();
      const organizedData = JSON.parse(jsonString) as { plan: SchedulingPlanItem[] };
      return organizedData.plan;

    } catch (error) {
      console.error('Error calling Gemini API:', error);
      alert('An error occurred while organizing the week. The AI may be temporarily unavailable. Please check the console for details.');
      return null;
    }
  }

  private createPrompt(tasks: Todo[], dailyLoad: Record<string, { total: number }>): string {
    const taskList = tasks.map(t => `- "${t.text}" (ID: ${t.id}, Duration: ${t.duration}m, Priority: ${this.getPriority(t)})`).join('\n');
    
    // Create a concise summary of the week's current load
    const weekSummary = Object.entries(dailyLoad)
      .map(([day, load]) => `${day}: ${load.total} minutes scheduled`)
      .join('\n');

    return `
      You are an expert life planner AI. Your task is to create a scheduling plan for a list of backlog tasks to fit into a 7-day week.

      **Rules & Constraints:**
      1.  **Daily Capacity:** Each day has a maximum capacity of 480 minutes (8 hours). Consider the time already scheduled.
      2.  **Prioritization:** Schedule high-priority tasks ('ASAP', 'SOON') earlier in the week (e.g., Monday-Wednesday). Lower priority tasks should be scheduled for later.
      3.  **Task Categories:** Tasks fit into categories: 'goal', 'focus', 'work', 'leisure'. Place tasks in their corresponding category slots.
      4.  **'Goal' Slot:** The 'goal' category for each day should contain AT MOST ONE task. It is for the day's single most important task.
      5.  **Preserve IDs:** Your output must be a plan that maps original task IDs to a day and category.
      6.  **Unscheduled Tasks:** If a task cannot be scheduled due to capacity limits, simply leave it out of the final plan.

      **Backlog Tasks to Schedule:**
      ${taskList}

      **Current Week Load (Time already scheduled per day):**
      ${weekSummary}

      Based on these rules, return a JSON object containing a 'plan' array. Each item in the array should be an object with 'id', 'day', and 'category' to schedule a task.
    `;
  }
  
  private getPriority(todo: Todo): string {
    if (todo.habit) return 'BASICS'; // Basics are not scheduled by this function
    if (todo.urgent && todo.important) return 'ASAP';
    if (!todo.urgent && todo.important) return 'SOON';
    if (todo.urgent && !todo.important) return 'PENDING';
    return 'LEISURE';
  }

  private createResponseSchema() {
    return {
      type: Type.OBJECT,
      properties: {
        plan: {
          type: Type.ARRAY,
          description: "The scheduling plan. Each object maps a task ID to a day and category.",
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.NUMBER, description: "The original ID of the task to schedule." },
              day: { 
                type: Type.STRING, 
                description: "The day to schedule the task on.",
                enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
              },
              category: { 
                type: Type.STRING, 
                description: "The category for the task.",
                enum: ['goal', 'focus', 'work', 'leisure']
              }
            },
            required: ['id', 'day', 'category']
          }
        }
      },
      required: ['plan']
    };
  }
}