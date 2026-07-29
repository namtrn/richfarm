import type { InteractiveLesson } from '../model';

export const pendulumLesson: InteractiveLesson = {
  id: 'pendulum',
  topicId: 'pendulum',
  steps: [
    {
      id: 'make-it-swing',
      kind: 'explore',
      titleKey: 'lesson.exploreTitle',
      promptKey: 'lesson.explorePrompt',
      editableVariables: ['angle'],
    },
    {
      id: 'choose-variable',
      kind: 'question',
      titleKey: 'lesson.questionTitle',
      promptKey: 'lesson.questionPrompt',
      editableVariables: ['length', 'mass', 'angle'],
    },
    {
      id: 'change-length',
      kind: 'experiment',
      titleKey: 'lesson.experimentTitle',
      promptKey: 'lesson.experimentPrompt',
      editableVariables: ['length'],
    },
    {
      id: 'predict-period',
      kind: 'prediction',
      titleKey: 'lesson.predictionTitle',
      promptKey: 'lesson.predictionPrompt',
      editableVariables: ['length'],
    },
    {
      id: 'find-pattern',
      kind: 'pattern',
      titleKey: 'lesson.patternTitle',
      promptKey: 'lesson.patternPrompt',
      editableVariables: [],
    },
    {
      id: 'reveal-equation',
      kind: 'equation',
      titleKey: 'lesson.equationTitle',
      promptKey: 'lesson.equationPrompt',
      editableVariables: [],
    },
    {
      id: 'moon-challenge',
      kind: 'challenge',
      titleKey: 'lesson.challengeTitle',
      promptKey: 'lesson.challengePrompt',
      editableVariables: ['gravity'],
    }
  ],
};
