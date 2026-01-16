import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Ticket, Plus, Trash2, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface CouponCode {
  id: string;
  code: string;
  credits: number;
  maxUses: number | null;
  usesCount: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export function CouponManagement() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newCredits, setNewCredits] = useState("1000");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data: coupons, isLoading } = useQuery<CouponCode[]>({
    queryKey: ["/api/admin/coupons"],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/coupons", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch coupons");
      return res.json();
    },
  });

  const createCouponMutation = useMutation({
    mutationFn: async (data: { code: string; credits: number; maxUses?: number; expiresAt?: string }) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create coupon");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      setIsCreateOpen(false);
      setNewCode("");
      setNewCredits("1000");
      setNewMaxUses("");
      setNewExpiresAt("");
      toast({ title: "Success", description: "Coupon code created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleCouponMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/coupons/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to update coupon");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
    },
  });

  const deleteCouponMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/coupons/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete coupon");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      toast({ title: "Success", description: "Coupon code deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete coupon", variant: "destructive" });
    },
  });

  const handleCreateCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode || !newCredits) return;
    
    createCouponMutation.mutate({
      code: newCode.toUpperCase(),
      credits: parseInt(newCredits),
      maxUses: newMaxUses ? parseInt(newMaxUses) : undefined,
      expiresAt: newExpiresAt || undefined,
    });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const generateRandomCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewCode(code);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-white">Coupon Codes</h2>
          <p className="text-gray-300">Create and manage promotional coupon codes for users to redeem credits</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Create Coupon
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-purple-500/30">
            <DialogHeader>
              <DialogTitle className="text-white">Create New Coupon Code</DialogTitle>
              <DialogDescription className="text-gray-400">
                Create a promotional code that users can redeem for bonus credits
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateCoupon} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Code</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., BONUS1000"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    className="bg-gray-800 border-gray-700 text-white font-mono uppercase"
                    maxLength={20}
                  />
                  <Button type="button" variant="outline" onClick={generateRandomCode}>
                    Generate
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Credits to Award</Label>
                <Input
                  type="number"
                  placeholder="1000"
                  value={newCredits}
                  onChange={(e) => setNewCredits(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Max Uses (optional)</Label>
                <Input
                  type="number"
                  placeholder="Unlimited"
                  value={newMaxUses}
                  onChange={(e) => setNewMaxUses(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white"
                  min="1"
                />
                <p className="text-xs text-gray-500">Leave empty for unlimited uses</p>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Expires At (optional)</Label>
                <Input
                  type="datetime-local"
                  value={newExpiresAt}
                  onChange={(e) => setNewExpiresAt(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white"
                />
                <p className="text-xs text-gray-500">Leave empty for no expiration</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="bg-purple-600 hover:bg-purple-700"
                  disabled={!newCode || !newCredits || createCouponMutation.isPending}
                >
                  {createCouponMutation.isPending ? "Creating..." : "Create Coupon"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-black/30 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Ticket className="h-5 w-5 text-purple-400" />
            Active Coupons
          </CardTitle>
          <CardDescription className="text-gray-400">
            {coupons?.length || 0} coupon codes created
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : !coupons?.length ? (
            <div className="text-center py-8">
              <Ticket className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No coupon codes created yet</p>
              <p className="text-sm text-gray-500 mt-1">Click "Create Coupon" to add your first promotional code</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700">
                  <TableHead className="text-gray-300">Code</TableHead>
                  <TableHead className="text-gray-300">Credits</TableHead>
                  <TableHead className="text-gray-300">Usage</TableHead>
                  <TableHead className="text-gray-300">Expires</TableHead>
                  <TableHead className="text-gray-300">Status</TableHead>
                  <TableHead className="text-gray-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((coupon) => (
                  <TableRow key={coupon.id} className="border-gray-700">
                    <TableCell className="font-mono text-white">
                      <div className="flex items-center gap-2">
                        {coupon.code}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyCode(coupon.code)}
                          className="h-6 w-6 p-0"
                        >
                          {copiedCode === coupon.code ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-gray-400" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-white">{coupon.credits.toLocaleString()}</TableCell>
                    <TableCell className="text-white">
                      {coupon.usesCount}{coupon.maxUses ? ` / ${coupon.maxUses}` : ""}
                    </TableCell>
                    <TableCell className="text-gray-400">
                      {coupon.expiresAt 
                        ? new Date(coupon.expiresAt).toLocaleDateString() 
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={coupon.isActive}
                          onCheckedChange={(checked) => 
                            toggleCouponMutation.mutate({ id: coupon.id, isActive: checked })
                          }
                        />
                        <Badge variant={coupon.isActive ? "default" : "secondary"}>
                          {coupon.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteCouponMutation.mutate(coupon.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
