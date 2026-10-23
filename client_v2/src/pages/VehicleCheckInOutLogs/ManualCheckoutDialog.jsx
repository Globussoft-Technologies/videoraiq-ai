import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function ManualCheckoutDialog({ vehicles, reason, setReason, busy, onCancel, onConfirm }) {
  return (
    <Dialog open={vehicles.length > 0} onOpenChange={open => { if (!open && !busy) onCancel(); }}>
      <DialogContent className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(480px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-y-auto p-6 bg-[var(--bg1solid)] text-[var(--tx)] border border-[var(--bd)] rounded-xl" closeBtn={busy ? 'hidden' : ''}>
        <DialogHeader>
          <DialogTitle>Manually check out {vehicles.length === 1 ? 'vehicle' : `${vehicles.length} vehicles`}?</DialogTitle>
          <DialogDescription className="text-[var(--tx2)]">
            Records a check-out at the current time and marks the vehicles as returned. Original camera records remain in history.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-36 overflow-auto text-sm text-[var(--tx2)]">
          {vehicles.map(vehicle => <div key={vehicle.vehicleKey}>{vehicle.vehicleNumber || 'Unreadable plate'}</div>)}
        </div>
        <label className="grid gap-2 text-sm">
          Reason (optional)
          <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} disabled={busy}
            placeholder="For example: vehicle left but the camera missed the exit"
            className="border border-[var(--bd)] rounded-lg p-3 bg-[var(--bg2)] resize-y min-h-20" />
        </label>
        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-lg border border-[var(--bd)] cursor-pointer disabled:opacity-50">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="px-4 py-2 rounded-lg bg-[var(--violet)] text-white cursor-pointer disabled:opacity-50">
            {busy ? 'Checking out…' : 'Confirm check-out'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
