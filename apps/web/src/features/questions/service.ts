import { appConfig } from "../../lib/config";
import { apiAudioRequest, apiRequest } from "../../lib/api/client";

export type QuestionSourceContext = {
  mode: "selection" | "page";
  pageIndex: number;
  text: string;
  spanIds: string[];
};

export type QuestionCitation = {
  pageIndex: number;
  quote: string;
  spanIds: string[];
};

export type LearningQuestionAction =
  | { type: "pdf_highlight"; pageIndex: number; quote: string; spanIds: string[] }
  | { type: "whiteboard_label"; text: string; x: number; y: number }
  | { type: "quiz"; question: string; options: string[]; correctIndex: number; explanation: string };

export type LearningQuestion = {
  id: string;
  question: string;
  visualContextSent?: boolean;
  answer: string | null;
  sourceContext: QuestionSourceContext;
  citations: QuestionCitation[];
  actions: LearningQuestionAction[];
  status: "pending" | "complete" | "failed";
  failureMessage: string | null;
  createdAt: string;
};

export type LearningQuestionAudioTranscript = {
  transcript: string;
};

export type TutorIntent = "ask" | "repeat" | "simpler" | "deeper" | "quiz";

export type AskLearningQuestion = {
  question: string;
  pageIndex: number;
  intent?: TutorIntent;
  selectedText?: string;
  selectedSpanIds?: string[];
  whiteboardImage?: string;
};

function assertAuthenticatedMode(): void {
  if (appConfig.demoMode) {
    throw new Error("Tutor questions require an authenticated account and an AI provider configured by the API.");
  }
}

export function getLearningQuestions(documentId: string): Promise<{ questions: LearningQuestion[] }> {
  assertAuthenticatedMode();
  return apiRequest<{ questions: LearningQuestion[] }>(`/documents/${encodeURIComponent(documentId)}/questions`);
}

export function askLearningQuestion(
  documentId: string,
  request: AskLearningQuestion,
): Promise<LearningQuestion> {
  assertAuthenticatedMode();
  return apiRequest<LearningQuestion>(`/documents/${encodeURIComponent(documentId)}/questions`, {
    method: "POST",
    body: request,
  });
}

export function transcribeLearningQuestion(
  documentId: string,
  audio: Blob,
): Promise<LearningQuestionAudioTranscript> {
  assertAuthenticatedMode();
  const formData = new FormData();
  formData.append("file", audio, "voice-question.wav");
  return apiRequest<LearningQuestionAudioTranscript>(
    `/documents/${encodeURIComponent(documentId)}/voice/transcribe`,
    { method: "POST", body: formData },
  );
}

export function getLearningQuestionAudio(documentId: string, questionId: string): Promise<Blob> {
  assertAuthenticatedMode();
  return apiAudioRequest(
    `/documents/${encodeURIComponent(documentId)}/questions/${encodeURIComponent(questionId)}/audio`,
  );
}
