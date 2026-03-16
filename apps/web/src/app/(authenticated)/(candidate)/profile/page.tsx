'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Save, Upload, FileText, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/components/page-header';
import { PageLoader } from '@/components/loading-spinner';
import {
  useCandidateProfile,
  updateCandidateProfile,
  uploadResume,
  deleteResume,
  useResumeAnalysis,
} from '@/hooks/use-candidate';
import { profileSchema, type ProfileValues } from '@/lib/validations';
import { toast } from '@/hooks/use-toast';

export default function ProfilePage() {
  const { data: profile, isLoading, mutate: mutateProfile } = useCandidateProfile();
  const { data: analysis, mutate: mutateAnalysis } = useResumeAnalysis(profile?.id);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      headline: '',
      bio: '',
      currentRole: '',
      currentCompany: '',
      locationCity: '',
      remotePreference: undefined,
      linkedinUrl: '',
      githubUrl: '',
      portfolioUrl: '',
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        headline: profile.headline || '',
        bio: profile.bio || '',
        currentRole: profile.currentRole || '',
        currentCompany: profile.currentCompany || '',
        locationCity: profile.locationCity || '',
        remotePreference: profile.remotePreference || undefined,
        linkedinUrl: profile.linkedinUrl || '',
        githubUrl: profile.githubUrl || '',
        portfolioUrl: profile.portfolioUrl || '',
      });
    }
  }, [profile, form]);

  const watchedValues = form.watch();

  function computeCompleteness(): number {
    let pct = 0;
    if (profile?.resumeUrl) pct += 20;
    if (analysis?.analyzed) pct += 10;
    if (watchedValues.headline) pct += 10;
    if (watchedValues.bio) pct += 10;
    if (watchedValues.currentRole) pct += 10;
    if (watchedValues.currentCompany) pct += 10;
    if (watchedValues.locationCity) pct += 10;
    if (watchedValues.linkedinUrl) pct += 10;
    if (watchedValues.githubUrl) pct += 10;
    return pct;
  }

  const completeness = computeCompleteness();

  async function onSubmit(values: ProfileValues) {
    setSaving(true);
    try {
      const payload = {
        ...values,
        linkedinUrl: values.linkedinUrl || undefined,
        githubUrl: values.githubUrl || undefined,
        portfolioUrl: values.portfolioUrl || undefined,
      };
      await updateCandidateProfile(payload);
      await mutateProfile();
      toast({ title: 'Profile updated' });
    } catch (err) {
      toast({
        title: 'Failed to update profile',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadResume(file);
      await mutateProfile();
      toast({ title: 'Resume uploaded', description: 'AI analysis will run in the background.' });
      // Poll for analysis results after a delay
      setTimeout(() => mutateAnalysis(), 5000);
      setTimeout(() => mutateAnalysis(), 15000);
    } catch (err) {
      toast({
        title: 'Failed to upload resume',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDeleteResume() {
    setDeleting(true);
    try {
      await deleteResume();
      await mutateProfile();
      await mutateAnalysis();
      toast({ title: 'Resume deleted' });
    } catch (err) {
      toast({
        title: 'Failed to delete resume',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeleting(false);
    }
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Profile" description="Manage your candidate profile" />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Profile Completeness</p>
            <p className="text-sm font-medium">{completeness}%</p>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${completeness}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Profile {completeness}% complete</p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Resume</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {profile?.resumeUrl ? (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm">Resume uploaded</span>
              </div>
              <div className="flex gap-2">
                <label className="cursor-pointer">
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={handleResumeUpload}
                    disabled={uploading}
                  />
                  <Button variant="outline" size="sm" asChild disabled={uploading}>
                    <span>
                      {uploading ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-1 h-4 w-4" />
                      )}
                      Replace
                    </span>
                  </Button>
                </label>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteResume}
                  disabled={deleting}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  {deleting ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors hover:border-primary/50 hover:bg-muted/50">
              <Input
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={handleResumeUpload}
                disabled={uploading}
              />
              {uploading ? (
                <Loader2 className="mb-2 h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {uploading ? 'Uploading...' : 'Upload Resume'}
              </span>
              <span className="text-xs text-muted-foreground">PDF, DOC, or DOCX (max 10MB)</span>
            </label>
          )}

          {analysis?.analyzed && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-sm font-medium">AI Analysis Results</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Seniority Level</p>
                    <Badge variant="secondary" className="mt-1 capitalize">
                      {analysis.seniorityLevel || 'Unknown'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Years of Experience</p>
                    <p className="mt-1 text-sm font-medium">
                      {analysis.yearsExperience != null
                        ? `${analysis.yearsExperience} years`
                        : 'Unknown'}
                    </p>
                  </div>
                </div>
                {analysis.domains?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Detected Domains</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {analysis.domains.map((domain: string) => (
                        <Link
                          key={domain}
                          href={`/challenges?domain=${encodeURIComponent(domain)}`}
                        >
                          <Badge
                            variant="outline"
                            className="cursor-pointer text-xs hover:bg-muted"
                          >
                            {domain}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Analyzed {new Date(analysis.analyzedAt!).toLocaleDateString()}
                </p>
              </div>
            </>
          )}

          {profile?.resumeUrl && !analysis?.analyzed && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              AI analysis in progress...
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Personal Info</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="headline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Headline</FormLabel>
                    <FormControl>
                      <Input placeholder="Full-Stack Developer" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Tell us about yourself..." rows={4} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="currentRole"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Role</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="currentCompany"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="locationCity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="San Francisco, CA" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="remotePreference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Remote Preference</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select preference" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="REMOTE">Remote</SelectItem>
                        <SelectItem value="HYBRID">Hybrid</SelectItem>
                        <SelectItem value="ONSITE">Onsite</SelectItem>
                        <SelectItem value="FLEXIBLE">Flexible</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <Separator />
              <FormField
                control={form.control}
                name="linkedinUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LinkedIn URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://linkedin.com/in/..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="githubUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GitHub URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://github.com/..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="portfolioUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Portfolio URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
