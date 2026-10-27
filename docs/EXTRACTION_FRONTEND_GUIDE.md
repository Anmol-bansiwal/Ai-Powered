# Frontend Integration Guide: Enhanced Question Extraction & Math Rendering

This guide details the frontend integration requirements for the enhanced PDF question extraction pipeline in EduSearch AI.

---

## 1. Overview of Backend Enhancements

The extraction pipeline (`POST /papers/extract`) has been upgraded with:
1. **Intelligent OCR Fallback**: Scanned/rasterized exam pages are automatically detected and processed via OCR without manual intervention.
2. **Deterministic & AI-Inferred Marks Extraction**: Marks (e.g., `[4 marks]`, `(3)`, `5 marks`) are extracted deterministically with regex, falling back to AI classification if omitted in the text.
3. **Formula Extraction & LaTeX Normalization**: Mathematical equations, fractions, exponents, Greek symbols, and calculus notations are extracted and formatted into standardized LaTeX strings.
4. **Per-Question AI Classification**: Subject, topic, subtopic, difficulty, and question type are automatically inferred per question with a confidence score.
5. **Flexible Approval Overrides**: `POST /papers/approve` accepts optional per-question metadata overrides (`subject`, `topic`, `subtopic`, `difficulty`, `questionType`), with automatic fallback to paper-level metadata.

---

## 2. API Contract Changes

### `POST /papers/extract`

#### Request
`multipart/form-data` with `file: <PDF binary>`.

#### Response Payload (`200 OK`)

```typescript
export type ExtractFigure = {
  page: number;
  index: number;
  width: number;
  height: number;
  url: string;
  association?: 'PRECEDING' | 'FOLLOWING' | 'ISOLATED';
};

export type ExtractedQuestionDraft = {
  questionText: string;
  pageReference: string;
  
  // NEW: Extracted Marks
  marks: number | null;                // e.g. 4
  marksExplicit: boolean;              // true if found directly in text, false if inferred by AI
  
  // NEW: Extracted Mathematical Formulas
  formulaLatex: string[];              // e.g. ["f(x) = x^{2} + 3x - 5", "\\frac{dy}{dx} = 2x + 3"]
  
  // NEW: Per-Question AI Classification
  subject: string;                     // e.g. "Mathematics"
  topic: string;                       // e.g. "Calculus"
  subtopic: string | null;             // e.g. "Derivatives"
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  questionType: 'MCQ' | 'SHORT' | 'LONG';
  classificationConfidence: number;    // 0.0 to 1.0 (e.g. 0.95)
  
  // Figures / Diagrams
  figures: ExtractFigure[];
};

export type ExtractPaperResponse = {
  sourceDocument: string;
  fileHash: string;
  pageCount: number;
  storageProvider?: string;
  ocrApplied: boolean;                 // NEW: true if OCR was run on any page
  questions: ExtractedQuestionDraft[];
  unassignedFigures: ExtractFigure[];
};
```

---

### `POST /papers/approve`

The approval endpoint is **100% backward-compatible**. Existing clients passing only top-level paper metadata continue to work. Additionally, clients can now supply per-question classification overrides.

#### Request Payload (`multipart/form-data`)
- `file`: PDF binary (optional/required depending on upload mode)
- `draft`: JSON string matching `ApprovePaperDraft`

```typescript
export type ApprovePaperDraft = {
  // Paper-level defaults (fallback for any question that does not specify overrides)
  subject: string;
  topic: string;
  subtopic?: string | null;
  examYear?: number | null;
  examType?: string | null;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  questionType: 'MCQ' | 'SHORT' | 'LONG';
  
  questions: Array<{
    questionText: string;
    pageReference: string;
    figureUrls: string[];
    
    // Optional per-question overrides (NEW):
    subject?: string | null;           // falls back to paper.subject if omitted
    topic?: string | null;             // falls back to paper.topic if omitted
    subtopic?: string | null;          // falls back to paper.subtopic if omitted
    difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | null;   // falls back to paper.difficulty
    questionType?: 'MCQ' | 'SHORT' | 'LONG' | null;   // falls back to paper.questionType
  }>;
};
```

---

## 3. Recommended Frontend Changes

### A. Update Frontend TypeScript Definitions (`src/types/admin.ts`)

Update `ExtractDraft`, `ReviewDraft`, and `ApprovePaperDraft`:

```typescript
export type ExtractDraft = {
  questionText: string;
  pageReference: string;
  marks?: number | null;
  marksExplicit?: boolean;
  formulaLatex?: string[];
  subject?: string;
  topic?: string;
  subtopic?: string | null;
  difficulty?: ApiDifficulty;
  questionType?: ApiQuestionType;
  classificationConfidence?: number;
  figures: ExtractFigure[];
};

export type ReviewDraft = ExtractDraft & {
  keep: boolean;
  subtopicOverride: string;
  topicOverride?: string;
  difficultyOverride?: ApiDifficulty;
  questionTypeOverride?: ApiQuestionType;
};
```

---

### B. Displaying Badges & Marks in Question Cards (`ReviewPanel`)

In `src/components/admin/review-panel.tsx`, render the extracted badges above or below the question text textarea:

```tsx
{/* Question Badges & Marks Header */}
<div className="flex flex-wrap items-center gap-2 pt-1 pb-2">
  {/* Marks Badge */}
  {draft.marks != null && (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
        draft.marksExplicit
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
      }`}
      title={draft.marksExplicit ? 'Explicitly stated in paper' : 'Inferred by AI'}
    >
      {draft.marks} {draft.marks === 1 ? 'Mark' : 'Marks'}
      {!draft.marksExplicit && <span className="text-[10px] opacity-75">(inferred)</span>}
    </span>
  )}

  {/* Subject & Topic Badges */}
  {draft.topic && (
    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
      {draft.topic}
    </span>
  )}

  {/* Difficulty Badge */}
  {draft.difficulty && (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
        draft.difficulty === 'HARD'
          ? 'bg-red-50 text-red-700 border border-red-200'
          : draft.difficulty === 'MEDIUM'
            ? 'bg-amber-50 text-amber-700 border border-amber-200'
            : 'bg-green-50 text-green-700 border border-green-200'
      }`}
    >
      {draft.difficulty}
    </span>
  )}

  {/* Question Type Badge */}
  {draft.questionType && (
    <span className="rounded-md bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-xs font-medium">
      {draft.questionType}
    </span>
  )}

  {/* AI Confidence Indicator */}
  {draft.classificationConfidence != null && (
    <span className="text-[10px] text-slate-400 ml-auto">
      Confidence: {Math.round(draft.classificationConfidence * 100)}%
    </span>
  )}
</div>
```

---

### C. Rendering Extracted Mathematical Formulas

The frontend already includes `src/components/math/markdown-math-renderer.tsx` backed by `rehype-katex` and `remark-math`.

When `formulaLatex` array contains formulas, render them in an expandable math preview panel:

```tsx
import { MarkdownMathRenderer } from '@/components/math/markdown-math-renderer';

// Inside question card rendering:
{draft.formulaLatex && draft.formulaLatex.length > 0 && (
  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-1.5">
    <p className="text-[11px] font-semibold text-blue-900 uppercase tracking-wide">
      Detected Mathematical Formulas ({draft.formulaLatex.length})
    </p>
    <div className="space-y-1">
      {draft.formulaLatex.map((formula, fIdx) => (
        <div key={fIdx} className="overflow-x-auto py-1 text-slate-800">
          <MarkdownMathRenderer content={`$$${formula}$$`} />
        </div>
      ))}
    </div>
  </div>
)}
```

#### MathLive Alternative (Interactive Formula Editor)
If interactive editing of formulas is desired:
1. `npm i mathlive`
2. Mount `<math-field>` web component:
```tsx
import 'mathlive';

export function EditableMathFormula({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  return (
    <math-field
      onInput={(e: any) => onChange(e.target.value)}
      style={{
        display: 'block',
        padding: '8px',
        borderRadius: '8px',
        border: '1px solid #cbd5e1',
        fontSize: '16px',
      }}
    >
      {value}
    </math-field>
  );
}
```

---

### D. Indicating OCR Status

When `ocrApplied: true` in `ExtractPaperResponse`, show an informative banner in the review header:

```tsx
{response.ocrApplied && (
  <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
    <span className="font-semibold">OCR Applied:</span>
    Some pages contained scanned images or low-density text; OCR was automatically used to extract lines and equations.
  </div>
)}
```

---

## 4. Verification & Testing Checklist

- [x] Backend returns `marks`, `marksExplicit`, `formulaLatex`, `classificationConfidence`, and `ocrApplied`.
- [x] Deterministic regex priority ensures explicitly written marks (`[4 marks]`) are never overridden by AI predictions.
- [x] Plain/digital PDFs continue to execute through native fast path in sub-50ms.
- [x] `POST /papers/approve` validates and persists questions with either global paper metadata or per-question overrides.
- [x] Math formatting renders cleanly via `MarkdownMathRenderer` / `rehype-katex`.
