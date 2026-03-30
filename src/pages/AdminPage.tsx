import { useState } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAdminAuth, ADMIN_EMAIL, ADMIN_DEFAULT_PASSWORD } from '@/contexts/AdminAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatSupabaseError, isUniqueViolation } from '@/lib/supabase-error';
import { useQueryClient } from '@tanstack/react-query';
import { useProducts, useUpdateProduct, useDeleteProduct, useFakeReports, useUpdateFakeReport, useDeleteFakeReport } from '@/hooks/useProducts';
import { EditProductDialog } from '@/components/EditProductDialog';
import { Product } from '@/types/product';
import { Package, Plus, ShieldCheck, LogOut, Lock, Pencil, AlertTriangle, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const AdminPage = () => {
  const { isAdmin, loading, login, logout, user } = useAdminAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    data: products = [],
    isLoading: productsLoading,
    isError: productsQueryFailed,
    error: productsQueryError,
    refetch: refetchProducts,
  } = useProducts();
  const {
    data: fakeReports = [],
    isLoading: reportsLoading,
    isError: reportsQueryFailed,
    error: reportsQueryError,
    refetch: refetchReports,
  } = useFakeReports();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const updateFakeReport = useUpdateFakeReport();
  const deleteFakeReport = useDeleteFakeReport();
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({
    email: ADMIN_EMAIL,
    password: ADMIN_DEFAULT_PASSWORD,
  });
  const [loginLoading, setLoginLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [form, setForm] = useState({
    productName: '',
    manufacturer: '',
    licenseNumber: '',
    batchNumber: '',
    address: '',
    validUntil: '',
    trustScore: '100',
  });

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    const { error } = await login(loginForm.email.trim(), loginForm.password);
    setLoginLoading(false);
    if (error) {
      toast({ title: 'Login failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Welcome back', description: 'You are logged in as admin.' });
    }
  };

  const handleLogout = async () => {
    await logout();
    toast({ title: 'Logged out' });
  };

  const handleEditSave = async (id: string, updates: {
    name?: string;
    manufacturer?: string;
    license_number?: string;
    batch_number?: string | null;
    trust_score?: number;
    status?: string;
  }) => {
    try {
      await updateProduct.mutateAsync({ id, ...updates });
      toast({ title: 'Product updated' });
      setEditDialogOpen(false);
      setEditProduct(null);
    } catch (err: unknown) {
      toast({
        title: 'Could not update product',
        description: formatSupabaseError(err),
        variant: 'destructive',
      });
      throw err;
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productName.trim() || !form.manufacturer.trim() || !form.licenseNumber.trim()) {
      toast({ title: 'Missing fields', description: 'Product name, manufacturer, and FSSAI license number are required.', variant: 'destructive' });
      return;
    }

    const trustScore = Math.min(100, Math.max(0, parseInt(form.trustScore, 10) || 100));
    const autoStatus = trustScore > 84 ? 'genuine' : trustScore >= 40 ? 'suspicious' : 'fake';

    setAddLoading(true);
    try {
      const { error: licError } = await supabase.from('fssai_licenses').insert({
        license_number: form.licenseNumber.trim(),
        company_name: form.manufacturer.trim(),
        address: form.address.trim() || null,
        valid_until: form.validUntil.trim() || null,
        status: 'active',
      });

      if (licError && !isUniqueViolation(licError)) {
        throw licError;
      }

      const { error: prodError } = await supabase.from('products').insert({
        name: form.productName.trim(),
        manufacturer: form.manufacturer.trim(),
        license_number: form.licenseNumber.trim(),
        batch_number: form.batchNumber.trim() || null,
        status: autoStatus,
        trust_score: trustScore,
        verification_source: 'admin',
        verified_at: new Date().toISOString(),
        is_admin_verified: true,
      });

      if (prodError) throw prodError;

      toast({ title: 'Product added', description: `${form.productName} has been registered with trust score ${trustScore}.` });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['fssai_licenses'] });
      setForm({ ...form, productName: '', manufacturer: '', licenseNumber: '', batchNumber: '', address: '', validUntil: '', trustScore: '100' });
    } catch (err: unknown) {
      toast({
        title: 'Could not add product',
        description: formatSupabaseError(err),
        variant: 'destructive',
      });
    } finally {
      setAddLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 py-12 md:py-20">
          <div className="container mx-auto px-4 max-w-sm">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 text-primary">
                  <Lock className="w-5 h-5" />
                  <CardTitle>Admin Login</CardTitle>
                </div>
                <CardDescription>Sign in to add products and manage trust scores.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-4">
                  Use <span className="font-mono">{ADMIN_EMAIL}</span> with password <span className="font-mono">12345678</span>
                  (create this user in Supabase Auth first, or we will try to register on first successful attempt when allowed).
                </p>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={ADMIN_EMAIL}
                      autoComplete="email"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
                      disabled={loginLoading}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                      disabled={loginLoading}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loginLoading}>
                    {loginLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                    ) : (
                      'Sign in'
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-8 md:py-12">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                Admin Dashboard
              </h1>
              <p className="text-muted-foreground mt-1">Add products and set trust scores.</p>
            </div>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>

          {(productsQueryFailed || reportsQueryFailed) && (
            <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm space-y-2">
              {productsQueryFailed && (
                <p>
                  <strong>Products could not load:</strong>{' '}
                  {formatSupabaseError(productsQueryError)}{' '}
                  <Button type="button" variant="link" className="h-auto p-0 align-baseline" onClick={() => void refetchProducts()}>
                    Retry
                  </Button>
                </p>
              )}
              {reportsQueryFailed && (
                <p>
                  <strong>Reports could not load:</strong>{' '}
                  {formatSupabaseError(reportsQueryError)}{' '}
                  <Button type="button" variant="link" className="h-auto p-0 align-baseline" onClick={() => void refetchReports()}>
                    Retry
                  </Button>
                </p>
              )}
            </div>
          )}

          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Add Product
              </CardTitle>
              <CardDescription>Only admins can add products. Set trust score (0–100) for users.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddProduct} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="productName">Product Name *</Label>
                  <Input
                    id="productName"
                    placeholder="e.g., Amul Butter"
                    value={form.productName}
                    onChange={(e) => update('productName', e.target.value)}
                    disabled={addLoading}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manufacturer">Manufacturer / Company *</Label>
                  <Input
                    id="manufacturer"
                    placeholder="e.g., Gujarat Cooperative Milk Marketing Federation"
                    value={form.manufacturer}
                    onChange={(e) => update('manufacturer', e.target.value)}
                    disabled={addLoading}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="licenseNumber" className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                    FSSAI License Number *
                  </Label>
                  <Input
                    id="licenseNumber"
                    placeholder="e.g., 10020021000123"
                    value={form.licenseNumber}
                    onChange={(e) => update('licenseNumber', e.target.value)}
                    disabled={addLoading}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trustScore">Trust Score (0–100)</Label>
                  <Input
                    id="trustScore"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="100"
                    value={form.trustScore}
                    onChange={(e) => update('trustScore', e.target.value)}
                    disabled={addLoading}
                  />
                  <p className="text-xs text-muted-foreground">Helps users assess product authenticity. Default: 100.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="batchNumber">Batch Number</Label>
                    <Input
                      id="batchNumber"
                      placeholder="e.g., BT20240101"
                      value={form.batchNumber}
                      onChange={(e) => update('batchNumber', e.target.value)}
                      disabled={addLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="validUntil">License Valid Until</Label>
                    <Input
                      id="validUntil"
                      type="date"
                      value={form.validUntil}
                      onChange={(e) => update('validUntil', e.target.value)}
                      disabled={addLoading}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Manufacturer Address</Label>
                  <Input
                    id="address"
                    placeholder="e.g., Anand, Gujarat, India"
                    value={form.address}
                    onChange={(e) => update('address', e.target.value)}
                    disabled={addLoading}
                  />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={addLoading}>
                  {addLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Product
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-10 max-w-5xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Fake product reports
              </CardTitle>
              <CardDescription>
                Confirm a report to validate the consumer claim: matching products (matching FSSAI number, or matching name and manufacturer) lose 10 trust points automatically. Reject invalid reports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reportsLoading ? (
                <p className="text-muted-foreground text-sm py-6">Loading reports...</p>
              ) : fakeReports.length === 0 ? (
                <p className="text-muted-foreground text-sm py-6">No reports submitted yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Brand / Mfr</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right w-[200px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fakeReports.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.product_name}</TableCell>
                          <TableCell>
                            <div>{r.brand_name}</div>
                            {r.fssai_number && (
                              <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                                FSSAI: {r.fssai_number}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate" title={r.reason}>
                            {r.reason}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded ${
                                r.status === 'pending'
                                  ? 'bg-slate-100 text-slate-800'
                                  : r.status === 'confirmed'
                                    ? 'bg-red-100 text-red-800'
                                    : r.status === 'rejected'
                                      ? 'bg-gray-100 text-gray-700'
                                      : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {r.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right space-x-2 whitespace-nowrap">
                            {r.status === 'pending' && user?.id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="gap-1"
                                  disabled={updateFakeReport.isPending}
                                  onClick={async () => {
                                    try {
                                      await updateFakeReport.mutateAsync({
                                        id: r.id,
                                        status: 'confirmed',
                                        reviewed_by: user.id,
                                        reviewed_at: new Date().toISOString(),
                                      });
                                      toast({
                                        title: 'Report confirmed',
                                        description:
                                          'Trust score was reduced by 10 on matching products (by FSSAI or name).',
                                      });
                                    } catch (err: unknown) {
                                      const msg = err instanceof Error ? err.message : 'Update failed';
                                      toast({ title: 'Could not confirm report', description: msg, variant: 'destructive' });
                                    }
                                  }}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  Confirm
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  disabled={updateFakeReport.isPending}
                                  onClick={async () => {
                                    try {
                                      await updateFakeReport.mutateAsync({
                                        id: r.id,
                                        status: 'rejected',
                                        reviewed_by: user.id,
                                        reviewed_at: new Date().toISOString(),
                                      });
                                      toast({ title: 'Report rejected' });
                                    } catch (err: unknown) {
                                      const msg = err instanceof Error ? err.message : 'Update failed';
                                      toast({ title: 'Could not reject report', description: msg, variant: 'destructive' });
                                    }
                                  }}
                                >
                                  <XCircle className="w-4 h-4" />
                                  Reject
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                disabled={deleteFakeReport.isPending}
                                onClick={async () => {
                                  if (!window.confirm("Are you sure you want to remove this report? Note: Removing it will not automatically restore the product's trust score.")) return;
                                  try {
                                    await deleteFakeReport.mutateAsync(r.id);
                                    toast({ title: 'Report removed successfully' });
                                  } catch (err: unknown) {
                                    const msg = err instanceof Error ? err.message : 'Delete failed';
                                    toast({ title: 'Could not remove report', description: msg, variant: 'destructive' });
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Remove
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-primary" />
                Edit Products
              </CardTitle>
              <CardDescription>View and edit existing products. Change trust score and status.</CardDescription>
            </CardHeader>
            <CardContent>
              {productsLoading ? (
                <p className="text-muted-foreground text-sm py-6">Loading products...</p>
              ) : products.length === 0 ? (
                <p className="text-muted-foreground text-sm py-6">No products yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Manufacturer</TableHead>
                        <TableHead>FSSAI</TableHead>
                        <TableHead>Trust</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{p.manufacturer}</TableCell>
                          <TableCell className="font-mono text-xs">{p.licenseNumber || '-'}</TableCell>
                          <TableCell>{p.trustScore ?? '-'}</TableCell>
                          <TableCell>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                              p.status === 'genuine' ? 'bg-green-100 text-green-800' :
                              p.status === 'suspicious' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {p.status}
                            </span>
                          </TableCell>
                          <TableCell className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditProduct(p);
                                setEditDialogOpen(true);
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              disabled={deleteProduct.isPending}
                              onClick={async () => {
                                if (!window.confirm(`Are you sure you want to permanently delete "${p.name}"?`)) return;
                                try {
                                  await deleteProduct.mutateAsync(p.id);
                                  toast({ title: 'Product deleted' });
                                } catch (err: unknown) {
                                  const msg = err instanceof Error ? err.message : 'Delete failed';
                                  toast({ title: 'Could not delete product', description: msg, variant: 'destructive' });
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <EditProductDialog
            product={editProduct}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            onSave={handleEditSave}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default AdminPage;
