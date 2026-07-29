import { create } from 'zustand';

type LessonSessionState = {
  stepByLesson: Record<string, number>;
  getStepIndex: (lessonId: string) => number;
  advance: (lessonId: string, totalSteps: number) => void;
  reset: (lessonId: string) => void;
};

export const useLessonSession = create<LessonSessionState>((set, get) => ({
  stepByLesson: {},
  getStepIndex: (lessonId) => get().stepByLesson[lessonId] ?? 0,
  advance: (lessonId, totalSteps) =>
    set((state) => ({
      stepByLesson: {
        ...state.stepByLesson,
        [lessonId]: Math.min((state.stepByLesson[lessonId] ?? 0) + 1, totalSteps - 1),
      },
    })),
  reset: (lessonId) =>
    set((state) => ({ stepByLesson: { ...state.stepByLesson, [lessonId]: 0 } })),
}));
