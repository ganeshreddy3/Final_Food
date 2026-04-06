import { useState } from 'react';
import { AlertTriangle, Send } from 'lucide-react';
import { useSubmitFakeReport } from '@/hooks/useProducts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName?: string;
  brandName?: string;
  fssaiNumber?: string;
}

export function ReportDialog({ open, onOpenChange, productName, brandName, fssaiNumber }: ReportDialogProps) {
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const submitReport = useSubmitFakeReport();

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast({
        title: "Reason required",
        description: "Please provide a reason for reporting this product.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      await submitReport.mutateAsync({
        product_name: productName || 'Unknown Product',
        brand_name: brandName || 'Unknown Brand',
        fssai_number: fssaiNumber,
        reason: reason,
        evidence: evidence,
      });
      
      toast({
        title: "Report submitted",
        description: "Thank you for helping us maintain product authenticity. Our team will review your report.",
      });
      
      setReason('');
      setEvidence('');
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Report failed",
        description: error.message || "Failed to submit report. Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-danger" />
            Report Suspicious Product
          </DialogTitle>
          <DialogDescription>
            Help protect other consumers by reporting fake or suspicious products. 
            Our admin team will review your report.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {(productName || brandName || fssaiNumber) && (
            <div className="p-3 rounded-lg bg-muted flex flex-col gap-1 text-sm">
              <Label className="text-xs text-muted-foreground mb-1">Product Details</Label>
              {productName && <p><span className="font-medium text-xs text-muted-foreground w-16 inline-block">Name:</span> {productName}</p>}
              {brandName && <p><span className="font-medium text-xs text-muted-foreground w-16 inline-block">Brand:</span> {brandName}</p>}
              {fssaiNumber && <p><span className="font-medium text-xs text-muted-foreground w-16 inline-block">FSSAI:</span> <span className="font-mono">{fssaiNumber}</span></p>}
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for reporting *</Label>
            <Textarea
              id="reason"
              placeholder="Describe why you believe this product is fake or suspicious..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="evidence">Additional evidence (optional)</Label>
            <Textarea
              id="evidence"
              placeholder="Any additional details that might help our investigation..."
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="bg-danger hover:bg-danger/90 text-danger-foreground"
          >
            {isSubmitting ? (
              "Submitting..."
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Submit Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
