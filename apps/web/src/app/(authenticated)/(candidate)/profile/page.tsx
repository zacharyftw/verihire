'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, Plus, X } from 'lucide-react';
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
  useCandidateSkills,
  updateCandidateProfile,
  addCandidateSkill,
  removeCandidateSkill,
} from '@/hooks/use-candidate';
import { useSkills } from '@/hooks/use-skills';
import { profileSchema, type ProfileValues } from '@/lib/validations';
import { toast } from '@/hooks/use-toast';

export default function ProfilePage() {
  const { data: profile, isLoading, mutate: mutateProfile } = useCandidateProfile();
  const { data: skills, mutate: mutateSkills } = useCandidateSkills();
  const { data: allSkills } = useSkills();
  const [saving, setSaving] = useState(false);
  const [addingSkill, setAddingSkill] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState('');

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      headline: '',
      bio: '',
      yearsExperience: 0,
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
        yearsExperience: profile.yearsExperience || 0,
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

  async function handleAddSkill() {
    if (!selectedSkillId) return;
    setAddingSkill(true);
    try {
      await addCandidateSkill({ skillId: selectedSkillId });
      await mutateSkills();
      setSelectedSkillId('');
      toast({ title: 'Skill added' });
    } catch (err) {
      toast({
        title: 'Failed to add skill',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setAddingSkill(false);
    }
  }

  async function handleRemoveSkill(skillId: string) {
    try {
      await removeCandidateSkill(skillId);
      await mutateSkills();
      toast({ title: 'Skill removed' });
    } catch {
      toast({ title: 'Failed to remove skill', variant: 'destructive' });
    }
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Profile" description="Manage your candidate profile" />

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
              <div className="grid grid-cols-2 gap-4">
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
                  name="yearsExperience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Years of Experience</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={e =>
                            field.onChange(e.target.value === '' ? 0 : Number(e.target.value))
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Skills</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {skills?.map(s => (
              <Badge key={s.skillId} variant="secondary" className="gap-1 pr-1">
                {s.skillId}
                <button
                  onClick={() => handleRemoveSkill(s.skillId)}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {!skills?.length && (
              <p className="text-sm text-muted-foreground">No skills added yet</p>
            )}
          </div>
          <div className="flex gap-2">
            <Select value={selectedSkillId} onValueChange={setSelectedSkillId}>
              <SelectTrigger className="w-60">
                <SelectValue placeholder="Add a skill..." />
              </SelectTrigger>
              <SelectContent>
                {allSkills?.items?.map(skill => (
                  <SelectItem key={skill.id} value={skill.id}>
                    {skill.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleAddSkill} disabled={!selectedSkillId || addingSkill}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
