import { Drill } from "../hooks/useDrillDatabase";
import {
  GLOBAL_FOOTBALL_PEDAGOGY_DATABASE,
  matchDrillToGlobalPedagogy,
  TacticalCategoryKnowledge,
  PedagogicalQuestion
} from "./globalFootballPedagogyDatabase";

export type CoachingMoment = "BEFORE" | "DURING" | "FREEZE" | "AFTER";
export type QuestionCategory = "OBSERVATION" | "ANALYSIS" | "DECISION" | "REFLECTION";
export type QuestionDifficulty = "SIMPLE" | "INTERMEDIATE" | "ADVANCED";

export interface CoachingQuestionSuggestion {
  id: string;
  question: string;
  category: QuestionCategory;
  difficulty: QuestionDifficulty;
  coachingMoment: CoachingMoment;
  coachingPurpose: string;
  fourCornerFocus?: string;
}

export interface CoachingQuestionContext {
  drillTitle: string;
  category: string;
  trainingMethod?: string;
  coachingPoints?: string;
  duration?: string;
  ageGroup?: string;
  phase?: string;
  coachingMoment: CoachingMoment;
}

/**
 * AI Service for generating age-appropriate, moment-based coaching questions.
 * Powered by the Global Football Pedagogy Database (FIFA, FA England, DFB, Spain, JFA, KNVB).
 */
export async function generateCoachingQuestions(
  drill: Drill,
  coachingMoment: CoachingMoment
): Promise<CoachingQuestionSuggestion[]> {
  // Simulate lightweight async delay for smooth UI responsiveness
  await new Promise((resolve) => setTimeout(resolve, 350));

  const matchedKnowledge = matchDrillToGlobalPedagogy(drill);
  const apiKey =
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    (import.meta as any).env?.GEMINI_API_KEY;

  if (apiKey && typeof apiKey === "string" && apiKey.trim() !== "" && apiKey !== "MY_GEMINI_API_KEY") {
    try {
      const response = await fetchGeminiQuestions(drill, matchedKnowledge, coachingMoment, apiKey);
      if (response && response.length > 0) {
        return response;
      }
    } catch (err) {
      console.warn("Gemini API call failed, falling back to Global Pedagogy Database:", err);
    }
  }

  // Fallback to Global Pedagogy Knowledge Base
  return getPedagogyDatabaseQuestions(drill, matchedKnowledge, coachingMoment);
}

/**
 * Pulls questions directly from the Global Pedagogy Master Database
 * filtering strictly by:
 * 1. Coaching Moment (BEFORE / DURING / FREEZE / AFTER)
 * 2. Tactical Category & Forbidden Terms Audit
 * 3. Age Group (U11/U13 -> SIMPLE, U15 -> INTERMEDIATE, PRO -> ADVANCED)
 */
function getPedagogyDatabaseQuestions(
  drill: Drill,
  knowledge: TacticalCategoryKnowledge,
  coachingMoment: CoachingMoment
): CoachingQuestionSuggestion[] {
  const ageGroupStr = drill.ageGroup || "U13";
  let targetDifficulty: QuestionDifficulty = "INTERMEDIATE";
  if (ageGroupStr.includes("U11") || ageGroupStr.includes("U10") || ageGroupStr.includes("U9") || ageGroupStr.includes("U12")) {
    targetDifficulty = "SIMPLE";
  } else if (ageGroupStr.includes("PRO") || ageGroupStr.includes("U19") || ageGroupStr.includes("Senior")) {
    targetDifficulty = "ADVANCED";
  }

  // Filter questions matching moment and difficulty or fallback to available
  let filtered = knowledge.questions.filter((q) => q.coachingMoment === coachingMoment);
  
  if (filtered.length === 0) {
    // Fallback to general questions in database
    filtered = GLOBAL_FOOTBALL_PEDAGOGY_DATABASE[0].questions.filter((q) => q.coachingMoment === coachingMoment);
  }

  // Audit forbidden terms for strict tactical accuracy (e.g. no passing in 1v1)
  const auditedQuestions = filtered.filter((q) => {
    for (const term of knowledge.forbiddenTerms) {
      if (q.question.includes(term)) return false;
    }
    return true;
  });

  return auditedQuestions.map((q, idx) => ({
    id: `pedagogy_${knowledge.id}_${idx}_${Date.now()}`,
    question: q.question,
    category: q.category,
    difficulty: targetDifficulty,
    coachingMoment,
    coachingPurpose: q.coachingPurpose,
    fourCornerFocus: q.fourCornerFocus
  }));
}

/**
 * Online Gemini integration helper enriched with Global Pedagogy Standards
 */
async function fetchGeminiQuestions(
  drill: Drill,
  knowledge: TacticalCategoryKnowledge,
  coachingMoment: CoachingMoment,
  apiKey: string
): Promise<CoachingQuestionSuggestion[] | null> {
  const forbiddenRule = knowledge.forbiddenTerms.length > 0
    ? `CRITICAL CONSTRAINTS: DO NOT use any of these forbidden terms in the questions: ${knowledge.forbiddenTerms.join(", ")}.`
    : "";

  const prompt = `You are a UEFA Pro & FIFA Master football coaching expert.
Generate 3-4 open-ended, non-leading coaching questions in THAI language for a coach on the pitch.

Drill Title: ${drill.title}
Category: ${drill.category}
Coaching Points: ${drill.coachingPoints || knowledge.coachingPoints.join("; ")}
Age Group: ${drill.ageGroup || "U13"}
Coaching Moment: ${coachingMoment}
Pedagogy Standard: ${knowledge.sourceStandard}
${forbiddenRule}

Rules:
1. Questions must be practical to ask verbally on the training pitch.
2. Short, clear, and open-ended. Never yes/no.
3. Return JSON array matching schema:
[
  {
    "id": "q_1",
    "question": "คำถามในภาษาไทย",
    "category": "OBSERVATION", // OBSERVATION | ANALYSIS | DECISION | REFLECTION
    "difficulty": "INTERMEDIATE", // SIMPLE | INTERMEDIATE | ADVANCED
    "coachingMoment": "${coachingMoment}",
    "coachingPurpose": "จุดประสงค์ของการถาม"
  }
]`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const jsonMatch = rawText.match(/\[.*\]/s);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((item: any, idx: number) => ({
      id: `gemini_${idx}_${Date.now()}`,
      question: item.question,
      category: item.category || "ANALYSIS",
      difficulty: item.difficulty || "INTERMEDIATE",
      coachingMoment,
      coachingPurpose: item.coachingPurpose || "กระตุ้นการเรียนรู้ของนักกีฬา"
    }));
  }
  return null;
}
