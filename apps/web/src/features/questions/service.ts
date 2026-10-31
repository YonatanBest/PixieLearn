import { appConfig } from "../../lib/config";
import { apiRequest } from "../../lib/api/client";

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

export type LearningQuestion = {
  id: string;
  question: string;
  answer: string | null;
  sourceContext: QuestionSourceContext;
  citations: QuestionCitation[];
  status: "pending" | "complete" | "failed";
  failureMessage: string | null;
  createdAt: string;
};

export type AskLearningQuestion = {
  question: string;
  pageIndex: number;
  selectedText?: string;
  selectedSpanIds?: string[];
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
