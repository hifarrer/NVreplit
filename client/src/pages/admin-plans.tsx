import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

// Admin API request function that uses adminToken
async function adminApiRequest(
  method: string,
  url: string,
  data?: unknown
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // Include admin token
  const token = localStorage.getItem('adminToken');
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  return res;
}
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Edit, Trash2, DollarSign, Users, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

interface Plan {
  id: string;
  name: string;
  features: string[];
  monthlyPrice: number | null; // null for yearly-only plans
  yearlyPrice: number;
  stripeMonthlyPriceId: string | null;
  stripeYearlyPriceId: string | null;
  credits: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function AdminPlansPage() {
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Fetch plans
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['/api/admin/plans'],
    queryFn: async () => {
      const response = await adminApiRequest('GET', '/api/admin/plans');
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch plans');
      }
      return response.json();
    },
  });

  // Create plan mutation
  const createPlanMutation = useMutation({
    mutationFn: async (planData: any) => {
      const response = await adminApiRequest('POST', '/api/admin/plans', planData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create plan');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      setIsCreateDialogOpen(false);
      toast({
        title: 'Success',
        description: 'Plan created successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update plan mutation
  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, ...planData }: any) => {
      const response = await adminApiRequest('PUT', `/api/admin/plans/${id}`, planData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update plan');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      setIsEditDialogOpen(false);
      setSelectedPlan(null);
      toast({
        title: 'Success',
        description: 'Plan updated successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete plan mutation
  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await adminApiRequest('DELETE', `/api/admin/plans/${id}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete plan');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      toast({
        title: 'Success',
        description: 'Plan deleted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreatePlan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const featuresText = formData.get('features') as string;
    const features = featuresText.split('\n').filter(f => f.trim());
    
    const monthlyPriceValue = formData.get('monthlyPrice') as string;
    const monthlyPrice = monthlyPriceValue && monthlyPriceValue.trim() !== '' 
      ? parseInt(monthlyPriceValue) * 100 
      : null; // null for yearly-only plans
    
    const planData = {
      name: formData.get('name'),
      features,
      monthlyPrice,
      yearlyPrice: parseInt(formData.get('yearlyPrice') as string) * 100, // Convert to cents
      stripeMonthlyPriceId: formData.get('stripeMonthlyPriceId') || null,
      stripeYearlyPriceId: formData.get('stripeYearlyPriceId') || null,
      credits: parseInt(formData.get('credits') as string),
      isActive: formData.get('isActive') === 'on',
    };
    
    createPlanMutation.mutate(planData);
  };

  const handleUpdatePlan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPlan) return;
    
    const formData = new FormData(e.currentTarget);
    
    const featuresText = formData.get('features') as string;
    const features = featuresText.split('\n').filter(f => f.trim());
    
    const monthlyPriceValue = formData.get('monthlyPrice') as string;
    const monthlyPrice = monthlyPriceValue && monthlyPriceValue.trim() !== '' 
      ? parseInt(monthlyPriceValue) * 100 
      : null; // null for yearly-only plans
    
    const planData = {
      id: selectedPlan.id,
      name: formData.get('name'),
      features,
      monthlyPrice,
      yearlyPrice: parseInt(formData.get('yearlyPrice') as string) * 100, // Convert to cents
      stripeMonthlyPriceId: formData.get('stripeMonthlyPriceId') || null,
      stripeYearlyPriceId: formData.get('stripeYearlyPriceId') || null,
      credits: parseInt(formData.get('credits') as string),
      isActive: formData.get('isActive') === 'on',
    };
    
    updatePlanMutation.mutate(planData);
  };

  const handleEditPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    setIsEditDialogOpen(true);
  };

  const handleDeletePlan = (id: string) => {
    if (confirm('Are you sure you want to delete this plan?')) {
      deletePlanMutation.mutate(id);
    }
  };

  const formatPrice = (priceInCents: number) => {
    return `$${(priceInCents / 100).toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Plans Management</h1>
          <p className="text-muted-foreground">Manage subscription plans and pricing</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin">
            <Button variant="outline">
              Back to Dashboard
            </Button>
          </Link>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-plan">
                <Plus className="h-4 w-4 mr-2" />
                Create Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Plan</DialogTitle>
                <DialogDescription>
                  Create a new subscription plan for users.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreatePlan} className="space-y-4">
                <div>
                  <Label htmlFor="name">Plan Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., Free, Basic, Premium"
                    required
                    data-testid="input-plan-name"
                  />
                </div>
                <div>
                  <Label htmlFor="features">Features (one per line)</Label>
                  <Textarea
                    id="features"
                    name="features"
                    placeholder="e.g., AI Music Generation\nCharacter Creation\nVideo Export"
                    rows={4}
                    required
                    data-testid="input-plan-features"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="monthlyPrice">Monthly Price ($)</Label>
                    <Input
                      id="monthlyPrice"
                      name="monthlyPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Leave empty for yearly-only"
                      data-testid="input-monthly-price"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Leave empty for yearly-only plans</p>
                  </div>
                  <div>
                    <Label htmlFor="yearlyPrice">Yearly Price ($)</Label>
                    <Input
                      id="yearlyPrice"
                      name="yearlyPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="99.99"
                      required
                      data-testid="input-yearly-price"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="credits">Credits</Label>
                  <Input
                    id="credits"
                    name="credits"
                    type="number"
                    min="0"
                    placeholder="10000"
                    required
                    data-testid="input-credits"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="stripeMonthlyPriceId">Stripe Monthly Price ID (optional)</Label>
                    <Input
                      id="stripeMonthlyPriceId"
                      name="stripeMonthlyPriceId"
                      placeholder="price_xxx"
                      data-testid="input-stripe-monthly-id"
                    />
                  </div>
                  <div>
                    <Label htmlFor="stripeYearlyPriceId">Stripe Yearly Price ID (optional)</Label>
                    <Input
                      id="stripeYearlyPriceId"
                      name="stripeYearlyPriceId"
                      placeholder="price_xxx"
                      data-testid="input-stripe-yearly-id"
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="isActive" name="isActive" defaultChecked />
                  <Label htmlFor="isActive">Active</Label>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createPlanMutation.isPending} data-testid="button-submit-create">
                    {createPlanMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Plan'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-6">
        {plans.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <DollarSign className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No plans created yet</h3>
              <p className="text-muted-foreground mb-4">Create your first subscription plan to get started</p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Plan
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan: Plan) => (
              <Card key={plan.id} className={!plan.isActive ? 'opacity-60' : ''}>
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {plan.name}
                        {!plan.isActive && <Badge variant="secondary">Inactive</Badge>}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Zap className="h-4 w-4" />
                        {plan.credits.toLocaleString()} credits
                      </CardDescription>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditPlan(plan)}
                        data-testid={`button-edit-${plan.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeletePlan(plan.id)}
                        disabled={deletePlanMutation.isPending}
                        data-testid={`button-delete-${plan.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {plan.monthlyPrice !== null ? (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Monthly:</span>
                        <span className="font-semibold">{formatPrice(plan.monthlyPrice)}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Monthly:</span>
                        <Badge variant="secondary" className="text-xs">Yearly Only</Badge>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Yearly:</span>
                      <span className="font-semibold">{formatPrice(plan.yearlyPrice)}</span>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">Features:</h4>
                    <ul className="text-sm space-y-1">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-green-500">✓</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {(plan.stripeMonthlyPriceId || plan.stripeYearlyPriceId) && (
                    <div className="pt-2 border-t">
                      <h4 className="text-sm font-medium mb-1">Stripe Integration:</h4>
                      <div className="text-xs text-muted-foreground space-y-1">
                        {plan.stripeMonthlyPriceId && (
                          <div>Monthly: {plan.stripeMonthlyPriceId}</div>
                        )}
                        {plan.stripeYearlyPriceId && (
                          <div>Yearly: {plan.stripeYearlyPriceId}</div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Plan Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Plan</DialogTitle>
            <DialogDescription>
              Update the plan details and pricing.
            </DialogDescription>
          </DialogHeader>
          {selectedPlan && (
            <form onSubmit={handleUpdatePlan} className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Plan Name</Label>
                <Input
                  id="edit-name"
                  name="name"
                  defaultValue={selectedPlan.name}
                  required
                  data-testid="input-edit-plan-name"
                />
              </div>
              <div>
                <Label htmlFor="edit-features">Features (one per line)</Label>
                <Textarea
                  id="edit-features"
                  name="features"
                  defaultValue={selectedPlan.features.join('\n')}
                  rows={4}
                  required
                  data-testid="input-edit-plan-features"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-monthlyPrice">Monthly Price ($)</Label>
                  <Input
                    id="edit-monthlyPrice"
                    name="monthlyPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={selectedPlan.monthlyPrice !== null ? (selectedPlan.monthlyPrice / 100).toString() : ''}
                    placeholder="Leave empty for yearly-only"
                    data-testid="input-edit-monthly-price"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Leave empty for yearly-only plans</p>
                </div>
                <div>
                  <Label htmlFor="edit-yearlyPrice">Yearly Price ($)</Label>
                  <Input
                    id="edit-yearlyPrice"
                    name="yearlyPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={(selectedPlan.yearlyPrice / 100).toString()}
                    required
                    data-testid="input-edit-yearly-price"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-credits">Credits</Label>
                <Input
                  id="edit-credits"
                  name="credits"
                  type="number"
                  min="0"
                  defaultValue={selectedPlan.credits.toString()}
                  required
                  data-testid="input-edit-credits"
                />
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="edit-stripeMonthlyPriceId">Stripe Monthly Price ID</Label>
                  <Input
                    id="edit-stripeMonthlyPriceId"
                    name="stripeMonthlyPriceId"
                    defaultValue={selectedPlan.stripeMonthlyPriceId || ''}
                    data-testid="input-edit-stripe-monthly-id"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-stripeYearlyPriceId">Stripe Yearly Price ID</Label>
                  <Input
                    id="edit-stripeYearlyPriceId"
                    name="stripeYearlyPriceId"
                    defaultValue={selectedPlan.stripeYearlyPriceId || ''}
                    data-testid="input-edit-stripe-yearly-id"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-isActive"
                  name="isActive"
                  defaultChecked={selectedPlan.isActive}
                />
                <Label htmlFor="edit-isActive">Active</Label>
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updatePlanMutation.isPending} data-testid="button-submit-edit">
                  {updatePlanMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Plan'
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}