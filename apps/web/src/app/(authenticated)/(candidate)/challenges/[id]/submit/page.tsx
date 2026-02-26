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
import { toast } from '@/hooks/use-toast';

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

  // Initialize code from active submission or starter code
  useEffect(() => {
    if (activeSubmission?.content) {
      setCode(activeSubmission.content);
      if (activeSubmission.language) setLanguage(activeSubmission.language);
    } else if (challenge?.starterCode) {
      setCode(challenge.starterCode);
    }
  }, [activeSubmission, challenge]);

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
    if (!activeSubmission?.id) {
      // Start a new submission first
      try {
        const sub = await startSubmission(id);
        await submitSolution(sub.id, { content: code, language });
        router.push(ROUTES.submissionResults(sub.id));
      } catch (err) {
        toast({
          title: 'Submission failed',
          description: err instanceof Error ? err.message : 'Something went wrong',
          variant: 'destructive',
        });
      }
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitSolution(activeSubmission.id, { content: code, language });
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
          <Select value={language} onValueChange={setLanguage}>
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
            onChange={value => setCode(value || '')}
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
            <div className="whitespace-pre-wrap text-sm text-muted-foreground">
              {challenge?.requirements
                ? typeof challenge.requirements === 'string'
                  ? challenge.requirements
                  : JSON.stringify(challenge.requirements, null, 2)
                : 'No specific requirements provided.'}
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
