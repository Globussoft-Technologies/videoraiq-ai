import React, { useEffect, useState } from 'react';
import moment from 'moment-timezone';
import { Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
import { UnifiedTimePicker } from './TimePickerComponents';
import { parseTime, formatTime } from './timeUtils';
import { getNVRs, getchannels } from '../Api/post';

const HOST = import.meta.env.VITE_BACKEND;

const editIncidentDetails = async (id, data) => {
  const token = getAccessToken();
  return axios.patch(`${HOST}/api/v1/incidents/${id}/details`, data, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });
};

const toDateInput = (value) => {
  const m = moment(value);
  return m.isValid() ? m.format('YYYY-MM-DD') : '';
};

const toTimeParts = (value) => {
  const m = moment(value);
  return m.isValid() ? parseTime(m.format('hh:mm A')) : parseTime('');
};

const EditANPRLogDialog = ({ open, onOpenChange, row, onSaved }) => {
  const [form, setForm] = useState({
    incidentName: '',
    vehicleNumber: '',
    severity: '',
    incidentDate: '',
    nvrId: '',
    channelId: '',
  });
  const [timeParts, setTimePartsState] = useState({ hour: '', minute: '', period: '' });
  const [saving, setSaving] = useState(false);
  const [nvrList, setNvrList] = useState([]);
  const [channelList, setChannelList] = useState([]);

  useEffect(() => {
    if (!open || !row) return;
    const source = row.timeOfIncident || row.createdAt;
    setForm({
      incidentName: row.incidentName === '--' ? '' : row.incidentName || '',
      vehicleNumber: row.vehicleNumber === '--' ? '' : row.vehicleNumber || '',
      severity: row.severity === '--' ? '' : row.severity || '',
      incidentDate: toDateInput(source),
      nvrId: row.nvrId || '',
      channelId: row.channelId || '',
    });
    setTimePartsState(toTimeParts(source));
  }, [open, row]);

  useEffect(() => {
    if (!open) return;
    getNVRs()
      .then((res) => setNvrList(res?.data?.body?.data || []))
      .catch((err) => console.log('Error fetching NVRs:', err));
  }, [open]);

  useEffect(() => {
    if (!open || !form.nvrId) {
      setChannelList([]);
      return;
    }
    getchannels({ nvrIds: [form.nvrId] })
      .then((res) => setChannelList(res?.data?.body?.data || []))
      .catch((err) => console.log('Error fetching channels:', err));
  }, [open, form.nvrId]);

  const handleTimeChange = (part, value) => {
    setTimePartsState((prev) => ({ ...prev, [part]: value }));
  };

  const handleNvrChange = (nvrId) => {
    setForm((f) => ({ ...f, nvrId, channelId: '' }));
  };

  const handleSave = async () => {
    if (!row?._id) return;
    setSaving(true);
    try {
      const timeString = formatTime(timeParts.hour, timeParts.minute, timeParts.period);
      const combined = timeString && form.incidentDate
        ? moment(`${form.incidentDate} ${timeString}`, 'YYYY-MM-DD hh:mm A')
        : null;

      await editIncidentDetails(row._id, {
        incidentName: form.incidentName,
        vehicleNumber: form.vehicleNumber,
        severity: form.severity,
        timeOfIncident: combined?.isValid() ? combined.toISOString() : undefined,
        nvrId: form.nvrId || undefined,
        channelId: form.channelId || undefined,
      });
      toast.success('Incident details updated');
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      console.log('Error updating incident details:', err);
      toast.error(
        err?.response?.data?.error || 'Failed to update incident details'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-white rounded-[12px] p-4 sm:p-6 w-full max-w-[95vw] sm:max-w-[480px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-[#333333] text-base font-semibold flex items-center gap-2">
            <Pencil className="w-4 h-4 text-[#07486A]" />
            Edit ANPR Log
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#595959]">
              Incident Name
            </label>
            <Input
              value={form.incidentName}
              onChange={(e) =>
                setForm((f) => ({ ...f, incidentName: e.target.value }))
              }
              className="h-9 text-sm border border-[#C7C7C7]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#595959]">
              NVR Name
            </label>
            <Select value={form.nvrId} onValueChange={handleNvrChange}>
              <SelectTrigger className="w-full h-9 border border-[#C7C7C7] rounded-lg text-sm bg-white text-[#595959]">
                <SelectValue placeholder="Select NVR" />
              </SelectTrigger>
              <SelectContent>
                {nvrList.map((nvr) => (
                  <SelectItem key={nvr._id || nvr.id} value={nvr._id || nvr.id}>
                    {nvr.nvrName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#595959]">
              Camera Name
            </label>
            <Select
              value={form.channelId}
              onValueChange={(v) => setForm((f) => ({ ...f, channelId: v }))}
              disabled={!form.nvrId}
            >
              <SelectTrigger className="w-full h-9 border border-[#C7C7C7] rounded-lg text-sm bg-white text-[#595959]">
                <SelectValue placeholder="Select Camera" />
              </SelectTrigger>
              <SelectContent>
                {channelList.map((cam) => (
                  <SelectItem key={cam._id || cam.id} value={cam._id || cam.id}>
                    {cam.customName || cam.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#595959]">
              Vehicle Number
            </label>
            <Input
              value={form.vehicleNumber}
              onChange={(e) =>
                setForm((f) => ({ ...f, vehicleNumber: e.target.value }))
              }
              className="h-9 text-sm border border-[#C7C7C7]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#595959]">
              Severity
            </label>
            <Select
              value={form.severity}
              onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}
            >
              <SelectTrigger className="w-full h-9 border border-[#C7C7C7] rounded-lg text-sm bg-white text-[#595959]">
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#595959]">
              Time of Incident
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={form.incidentDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, incidentDate: e.target.value }))
                }
                className="h-9 text-sm border border-[#C7C7C7] flex-1"
              />
              <UnifiedTimePicker
                hour={timeParts.hour}
                minute={timeParts.minute}
                period={timeParts.period}
                onChange={handleTimeChange}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            className="bg-[#07486A] text-white hover:bg-[#053a56] cursor-pointer"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditANPRLogDialog;
