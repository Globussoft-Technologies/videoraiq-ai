import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateIncidentReportStatus } from '../Api/post';
import { toast } from 'sonner';
import { CheckCircle } from 'lucide-react';

const ReportIncidentModal = ({ isOpen, onClose, incidentId, incidentData, onSuccess }) => {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const existingReport = incidentData?.report;
  const hasExistingReport = existingReport?.status && existingReport?.description;

  useEffect(() => {
    if (isOpen && hasExistingReport && !isEditing) {
      setDescription(existingReport.description);
    } else if (isOpen && !hasExistingReport) {
      setDescription('');
    }
  }, [isOpen, incidentId, hasExistingReport]);

  useEffect(() => {
    // Reset editing state when modal opens with a different incident
    if (isOpen && isEditing) {
      setIsEditing(false);
    }
  }, [incidentId, isOpen]);

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error('Please enter a description');
      return;
    }

    setLoading(true);
    try {
      const data = {
        incidentId,
        status: true,
        description: description.trim(),
      };

      const result = await updateIncidentReportStatus(data);
      
      if (result?.status === 'success' || result) {
        toast.success('Incident reported successfully');
        setDescription('');
        onClose();
        if (onSuccess) onSuccess();
      } else {
        toast.error(result?.message || 'Failed to report incident');
      }
    } catch (error) {
      console.error('Error reporting incident:', error);
      toast.error(error?.response?.data?.body?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open) => {
    if (!open) {
      setDescription('');
      setIsEditing(false);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-md rounded-lg border border-[#E4E4E4] bg-white p-6 shadow-lg left-[50%] top-[50%] -translate-x-1/2 -translate-y-1/2">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-gray-800">Report Incident</DialogTitle>
            {hasExistingReport && !isEditing && (
              <div className="flex items-center gap-1 text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
                <CheckCircle className="w-4 h-4" />
                <span>Reported</span>
              </div>
            )}
          </div>
        </DialogHeader>

        {hasExistingReport && !isEditing ? (
          <div className="grid gap-4 py-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm font-medium text-green-900 mb-2">Report Status: Completed</p>
              <div className="bg-white rounded p-3 border border-green-100">
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{existingReport.description}</p>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Submitted on {new Date(incidentData?.report?.reportedAt || new Date()).toLocaleString()}
              </p>
            </div>
            <Button
              onClick={() => setIsEditing(true)}
              variant="outline"
              className="w-full text-blue-600 border-blue-300 hover:bg-blue-50"
            >
              Edit Report
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="description" className="text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                id="description"
                placeholder="Describe the incident and actions taken..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full h-24 rounded-[12px] border border-[#E6E6E6] bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                disabled={loading}
              />
              <p className="text-xs text-gray-500">
                Provide details about the incident and any actions that have been taken.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2 justify-end pt-2">
          <Button
            variant="outline"
            onClick={() => {
              if (isEditing) {
                setIsEditing(false);
                setDescription(existingReport?.description || '');
              } else {
                onClose();
              }
            }}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            {isEditing ? 'Cancel' : 'Close'}
          </Button>
          {(isEditing || !hasExistingReport) && (
            <Button
              onClick={handleSubmit}
              disabled={loading || !description.trim()}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? 'Reporting...' : 'Report'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportIncidentModal;
