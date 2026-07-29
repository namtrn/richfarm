export type ExperimentVariable = 'length' | 'mass' | 'angle' | 'gravity';

export type LessonStepKind =
  | 'explore'
  | 'question'
  | 'experiment'
  | 'prediction'
  | 'pattern'
  | 'equation'
  | 'challenge';

export type LessonStep = {
  id: string;
  kind: LessonStepKind;
  titleKey: string;
  promptKey: string;
  editableVariables: ExperimentVariable[];
};

export type InteractiveLesson = {
  id: string;
  topicId: string;
  steps: LessonStep[];
};
