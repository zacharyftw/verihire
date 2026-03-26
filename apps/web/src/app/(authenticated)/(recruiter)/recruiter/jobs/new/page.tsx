'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { createJob, addJobSkill } from '@/hooks/use-jobs';
import { useSkills } from '@/hooks/use-skills';
import { jobSchema, type JobValues } from '@/lib/validations';
import { ROUTES } from '@/lib/constants';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

export default function NewJobPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const { data: skillsData } = useSkills();

  const form = useForm<JobValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(jobSchema) as any,
    defaultValues: {
      title: '',
      description: '',
      requirements: '',
      responsibilities: '',
      locationCity: '',
      salaryCurrency: 'USD',
    },
  });

  async function onSubmit(values: JobValues) {
    setSaving(true);
    try {
      const job = await createJob(values);
      for (const skillId of selectedSkills) {
        await addJobSkill(job.id, skillId, true);
      }
      toast({ title: 'Job created' });
      router.push(ROUTES.jobDetail(job.id));
    } catch (err) {
      toast({
        title: 'Failed to create job',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href={ROUTES.jobs}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Jobs
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Create New Job</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Senior Software Engineer" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea rows={6} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requirements"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Requirements</FormLabel>
                    <FormControl>
                      <Textarea rows={4} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="responsibilities"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsibilities</FormLabel>
                    <FormControl>
                      <Textarea rows={4} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
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
                  name="remotePolicy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remote Policy</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="REMOTE">Remote</SelectItem>
                          <SelectItem value="HYBRID">Hybrid</SelectItem>
                          <SelectItem value="ONSITE">Onsite</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="employmentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employment Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="FULL_TIME">Full Time</SelectItem>
                          <SelectItem value="PART_TIME">Part Time</SelectItem>
                          <SelectItem value="CONTRACT">Contract</SelectItem>
                          <SelectItem value="INTERNSHIP">Internship</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="experienceLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Experience Level</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Senior" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="salaryMin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Salary Min</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="salaryMax"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Salary Max</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="salaryCurrency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Required Skills</label>
                {skillsData?.items && skillsData.items.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {skillsData.items.map(skill => {
                      const isSelected = selectedSkills.includes(skill.id);
                      return (
                        <Badge
                          key={skill.id}
                          variant={isSelected ? 'default' : 'outline'}
                          className="cursor-pointer select-none"
                          onClick={() =>
                            setSelectedSkills(prev =>
                              isSelected ? prev.filter(id => id !== skill.id) : [...prev, skill.id]
                            )
                          }
                        >
                          {skill.name}
                        </Badge>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No skills available</p>
                )}
                {selectedSkills.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedSkills.length} skill{selectedSkills.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create Job'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
