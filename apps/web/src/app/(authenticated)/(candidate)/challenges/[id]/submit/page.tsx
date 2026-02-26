'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Save, Send, Clock } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/loading-spinner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useChallenge } from '@/hooks/use-challenges';
import {
  useActiveSubmission,
  startSubmission,
  updateSubmission,
  submitSolution,
} from '@/hooks/use-submissions';
import { ROUTES } from '@/lib/constants';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

function parseAndRenderRequirements(data: unknown): React.ReactNode {
  if (!data) return 'No specific requirements provided.';
  let parsed = data;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return parsed as string;
    }
  }
  if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {parsed.map((item: string, i: number) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }
  if (typeof parsed === 'string') return parsed;
  return JSON.stringify(parsed, null, 2);
}

/**
 * Parse JS/TS function signatures from starter code and convert to the target language.
 */
function convertStarterCode(jsCode: string, targetLang: string): string {
  if (targetLang === 'javascript' || targetLang === 'typescript') return jsCode;

  // Extract functions: name and params
  const fnRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*\{[^}]*\/\/\s*Your code here[^}]*\}/g;
  const functions: { name: string; params: string[] }[] = [];
  let match;
  while ((match = fnRegex.exec(jsCode)) !== null) {
    functions.push({
      name: match[1],
      params: match[2]
        .split(',')
        .map(p => p.trim())
        .filter(Boolean),
    });
  }

  if (!functions.length) return `// Implement your solution here\n`;

  // Also extract top-level comments
  const commentMatch = jsCode.match(/^\/\/\s*(.+)/);
  const topComment = commentMatch ? commentMatch[1] : 'Implement your solution';

  switch (targetLang) {
    case 'python':
      return [
        `# ${topComment}`,
        '',
        ...functions.map(
          fn =>
            `def ${toSnakeCase(fn.name)}(${fn.params.join(', ')}):\n    # Your code here\n    pass`
        ),
      ].join('\n\n');

    case 'java':
      return [
        `// ${topComment}`,
        '',
        'public class Solution {',
        ...functions.map(
          fn =>
            `    public static Object ${fn.name}(${fn.params.map(p => `Object ${p}`).join(', ')}) {\n        // Your code here\n        return null;\n    }`
        ),
        '}',
      ].join('\n\n');

    case 'cpp':
      return [
        `// ${topComment}`,
        '#include <vector>',
        '#include <algorithm>',
        'using namespace std;',
        '',
        ...functions.map(
          fn =>
            `auto ${fn.name}(${fn.params.map(p => `auto ${p}`).join(', ')}) {\n    // Your code here\n}`
        ),
      ].join('\n\n');

    case 'go':
      return [
        `// ${topComment}`,
        'package main',
        '',
        ...functions.map(
          fn =>
            `func ${fn.name}(${fn.params.map(p => `${p} interface{}`).join(', ')}) interface{} {\n\t// Your code here\n\treturn nil\n}`
        ),
      ].join('\n\n');

    case 'rust':
      return [
        `// ${topComment}`,
        '',
        ...functions.map(
          fn =>
            `fn ${toSnakeCase(fn.name)}(${fn.params.map(p => `${p}: Vec<i32>`).join(', ')}) -> Vec<i32> {\n    // Your code here\n    vec![]\n}`
        ),
      ].join('\n\n');

    default:
      return jsCode;
  }
}

function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then(mod => mod.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] items-center justify-center bg-muted">Loading editor...</div>
  ),
});

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
];

export default function SubmitChallengePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: challenge, isLoading: challengeLoading } = useChallenge(id);
  const { data: activeSubmission, isLoading: subLoading } = useActiveSubmission(id);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const hasUserEdited = useRef(false);
  const lastGeneratedCode = useRef<string>('');

  // Initialize code from active submission or starter code
  useEffect(() => {
    if (activeSubmission?.content) {
      setCode(activeSubmission.content);
      if (activeSubmission.language) setLanguage(activeSubmission.language);
      hasUserEdited.current = true;
    } else if (challenge?.starterCode) {
      const initial = challenge.starterCode;
      setCode(initial);
      lastGeneratedCode.current = initial;
    }
  }, [activeSubmission, challenge]);

  function handleLanguageChange(newLang: string) {
    setLanguage(newLang);
    // Only swap boilerplate if user hasn't manually edited beyond starter code
    if (!hasUserEdited.current && challenge?.starterCode) {
      const converted = convertStarterCode(challenge.starterCode, newLang);
      setCode(converted);
      lastGeneratedCode.current = converted;
    }
  }

  function handleCodeChange(value: string | undefined) {
    const val = value || '';
    setCode(val);
    if (val !== lastGeneratedCode.current) {
      hasUserEdited.current = true;
    }
  }

  // Timer
  useEffect(() => {
    if (!activeSubmission?.startedAt || !challenge?.timeLimitMinutes) return;
    const deadline =
      new Date(activeSubmission.startedAt).getTime() + challenge.timeLimitMinutes * 60000;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSubmission?.startedAt, challenge?.timeLimitMinutes]);

  // Auto-save
  const autoSave = useCallback(async () => {
    if (!activeSubmission?.id || !code) return;
    try {
      await updateSubmission(activeSubmission.id, { content: code, language });
    } catch {
      // silent auto-save failure
    }
  }, [activeSubmission?.id, code, language]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(autoSave, 5000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [autoSave]);

  if (challengeLoading || subLoading) return <PageLoader />;

  async function handleSave() {
    if (!activeSubmission?.id) return;
    try {
      await updateSubmission(activeSubmission.id, { content: code, language });
      toast({ title: 'Progress saved' });
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      let subId = activeSubmission?.id;

      // If no active submission loaded, try starting one (may already exist)
      if (!subId) {
        try {
          const sub = await startSubmission(id);
          subId = sub.id;
        } catch {
          // If start fails (already exists), re-fetch the active submission
          const fetched = await api.get<{ id: string }>(`/submissions/active/${id}`);
          subId = fetched?.id;
        }
      }

      if (!subId) {
        toast({ title: 'No active submission found', variant: 'destructive' });
        return;
      }

      const result = await submitSolution(subId, { content: code, language });
      toast({ title: 'Solution submitted!' });
      router.push(ROUTES.submissionResults(result.id));
    } catch (err) {
      toast({
        title: 'Submission failed',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={ROUTES.challengeDetail(id)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">{challenge?.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {timeLeft !== null && (
            <div
              className={`flex items-center gap-1 font-mono text-sm ${timeLeft < 300 ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              <Clock className="h-4 w-4" />
              {formatTime(timeLeft)}
            </div>
          )}
          <Select value={language} onValueChange={handleLanguageChange}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map(lang => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
          <Button size="sm" onClick={() => setConfirmOpen(true)}>
            <Send className="mr-2 h-4 w-4" />
            Submit
          </Button>
        </div>
      </div>

      <div className="mt-4 grid flex-1 gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-lg border lg:col-span-2">
          <MonacoEditor
            height="100%"
            language={language}
            value={code}
            onChange={handleCodeChange}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
            }}
          />
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              {parseAndRenderRequirements(challenge?.requirements)}
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Submit Solution"
        description="Are you sure you want to submit? This action cannot be undone. Your code will be evaluated by AI."
        confirmLabel="Submit"
        onConfirm={handleSubmit}
        loading={submitting}
      />
    </div>
  );
}
