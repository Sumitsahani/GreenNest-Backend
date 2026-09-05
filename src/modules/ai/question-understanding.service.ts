import { Injectable } from '@nestjs/common';

export type PlantQuestionIntent =
  | 'PLANT_IDENTIFICATION'
  | 'WATERING'
  | 'FERTILIZER'
  | 'LIGHT'
  | 'SOIL'
  | 'REPOTTING'
  | 'DISEASE'
  | 'PEST'
  | 'PLANT_HEALTH'
  | 'WEATHER'
  | 'CARE'
  | 'PLANT_HISTORY'
  | 'RECOMMENDATION'
  | 'GENERAL_PLANT_QUESTION'
  | 'OTHER';

@Injectable()
export class QuestionUnderstandingService {
  classify(question: string): PlantQuestionIntent {
    const q = question.toLowerCase();
    if (/identify|which plant|what plant|plant name|kaunsa paudha/.test(q)) return 'PLANT_IDENTIFICATION';
    if (/water|paani|soil wet|soil dry/.test(q)) return 'WATERING';
    if (/fertili|manure|khaad/.test(q)) return 'FERTILIZER';
    if (/sun|light|shade|window|dhoop/.test(q)) return 'LIGHT';
    if (/soil|mitti|drainage/.test(q)) return 'SOIL';
    if (/repot|pot change|gamla/.test(q)) return 'REPOTTING';
    if (/pest|insect|bug|aphid|mite/.test(q)) return 'PEST';
    if (/disease|fung|rot|infection/.test(q)) return 'DISEASE';
    if (/yellow|brown|droop|health|symptom|dying/.test(q)) return 'PLANT_HEALTH';
    if (/weather|temperature|humidity|rain/.test(q)) return 'WEATHER';
    if (/history|previous|before|last time/.test(q)) return 'PLANT_HISTORY';
    if (/recommend|what next|should i|kya karu/.test(q)) return 'RECOMMENDATION';
    if (/care|prune|grow|maintenance/.test(q)) return 'CARE';
    if (/plant|garden|flower|herb/.test(q)) return 'GENERAL_PLANT_QUESTION';
    return 'OTHER';
  }
}
