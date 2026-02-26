'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { PageHeader } from '@/components/page-header';
import { PageLoader } from '@/components/loading-spinner';
import { useRecruiterProfile } from '@/hooks/use-recruiter';
import { useCompany, createCompany, updateCompany } from '@/hooks/use-companies';
import { companySchema, type CompanyValues } from '@/lib/validations';
import { toast } from '@/hooks/use-toast';

export default function CompanyPage() {
  const { data: recruiter, isLoading: recruiterLoading } = useRecruiterProfile();
  const {
    data: company,
    isLoading: companyLoading,
    mutate,
  } = useCompany(recruiter?.companyId || undefined);
  const [saving, setSaving] = useState(false);

  const form = useForm<CompanyValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: '',
      description: '',
      industry: '',
      companySize: '',
      websiteUrl: '',
      headquartersCity: '',
      headquartersCountry: '',
    },
  });

  useEffect(() => {
    if (company) {
      form.reset({
        name: company.name || '',
        description: company.description || '',
        industry: company.industry || '',
        companySize: company.companySize || '',
        websiteUrl: company.websiteUrl || '',
        headquartersCity: company.headquartersCity || '',
        headquartersCountry: company.headquartersCountry || '',
      });
    }
  }, [company, form]);

  async function onSubmit(values: CompanyValues) {
    setSaving(true);
    try {
      if (company) {
        await updateCompany(company.id, values);
      } else {
        await createCompany(values);
      }
      await mutate();
      toast({ title: company ? 'Company updated' : 'Company created' });
    } catch (err) {
      toast({
        title: 'Failed to save',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  if (recruiterLoading || companyLoading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Company"
        description={company ? 'Edit your company details' : 'Create your company profile'}
      />

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                      <Textarea rows={4} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="industry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Industry</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="companySize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Size</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 50-200" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="websiteUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="headquartersCity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="headquartersCountry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : company ? 'Update Company' : 'Create Company'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
