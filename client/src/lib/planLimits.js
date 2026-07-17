import { normalizeTemplateType } from "./templateTypes";

export const BASIC_LIMITS = {
  MCQ:{maxItems:20,maxTimeSec:120,maxChoices:4,minChoices:2,allowModified:false,allowImages:false},
  TRUE_FALSE:{maxItems:20,maxTimeSec:120,allowImages:false},
  TYPE_ANSWER:{maxItems:20,maxTimeSec:120,allowImages:false},
  MATCHING:{maxItems:10,maxTimeSec:300,maxPairs:5,maxDummyAnswers:1,allowImages:false},
  GUESS_WORD_4PICS:{maxItems:10,maxTimeSec:300,allowImages:false},
  THINK_SPELL:{maxItems:5,maxTimeSec:300,maxWords:4,allowImages:false},
  questionBankPerTemplate:5,
  live:{allowGroupMode:false,maxStudents:45},
};
export function getTemplateLimit(templateType){ return BASIC_LIMITS[normalizeTemplateType(templateType)] || {maxItems:20,maxTimeSec:120,allowImages:false}; }
export function isInstitutionPlan(user){ return user?.plan_code === "INSTITUTION" || !!String(user?.institution_name||"").trim(); }
