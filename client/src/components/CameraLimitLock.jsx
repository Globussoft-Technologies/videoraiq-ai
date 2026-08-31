import { useState } from 'react';
import { TriangleAlert, VideoOff, Loader2, ChevronRight, LifeBuoy, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { useAllDetections } from '../context/Sockets/AllDetectionContext';
import { SUPPORT_CONTACT } from '../helpers/support';

// Whether Super Admin licensing applies to this deployment. Its own variable
// rather than VITE_LOCAL_SETUP, which already drives streams and auth here.
// Mirrors client_v2's IS_LICENSING_ENABLED and the backend's LICENSING_ENABLED.
// Unset means enabled; only an explicit "false" turns licensing off.
const IS_LICENSING_ENABLED = import.meta.env.VITE_LICENSING_ENABLED !== 'false';
import { getAllNvrDetails } from '../page/user/Streams/Api/get';
import CameraDiscoveryModal from '../page/user/Streams/CameraDiscoveryModal';

// App-wide blocking overlay shown when a client has added more cameras than
// they purchased. Driven purely by the `purchasedCameras_<adminId>` socket
// event (surfaced via cameraLimit): it appears the moment `added` exceeds
// `purchasedCameras` and disappears automatically on the next payload where
// they're back in balance. While shown it covers the whole app (header
// included) and swallows all clicks/scroll, so the user cannot navigate
// anywhere. The only way out is to remove the excess cameras via the
// Manage Cameras modal, which we render on top of this lock.
const CameraLimitLock = () => {
  const { cameraLimit } = useAllDetections();

  // NVRs to choose from + the one whose Manage Cameras modal is open.
  const [nvrs, setNvrs] = useState([]);
  const [pickingNvr, setPickingNvr] = useState(false); // multi-NVR picker visible
  const [loadingNvrs, setLoadingNvrs] = useState(false);
  const [activeNvrId, setActiveNvrId] = useState(null); // modal open for this NVR

  // Licensing off (on-premise): no camera licence to exceed, so neither lock
  // applies.
  if (!IS_LICENSING_ENABLED) return null;

  const { purchasedCameras = 0, added = 0 } = cameraLimit || {};

  // Two lock states, both from the socket snapshot:
  //   unlicensed — the superadmin has licensed zero cameras. Nothing the user
  //                can do in-app fixes it, so this offers support contact only.
  //   overLimit  — more cameras added than purchased; recoverable by removing
  //                the excess, so Manage Cameras is offered.
  // Only an explicit `licensed: false` locks; an absent flag (older server, or
  // no snapshot yet) must never freeze the app.
  const unlicensed = cameraLimit?.licensed === false;
  const overLimit = purchasedCameras > 0 && added > purchasedCameras;
  if (!unlicensed && !overLimit) return null;

  const excess = added - purchasedCameras;
  const supportEmail = SUPPORT_CONTACT.email?.trim() || '';
  const supportPhone = SUPPORT_CONTACT.phone?.trim() || '';

  // Fetch the client's NVRs, then open the modal directly (one NVR) or show a
  // picker (multiple). The modal itself handles add/remove + save.
  const handleManageClick = async () => {
    setLoadingNvrs(true);
    try {
      const res = await getAllNvrDetails();
      const list = res?.data?.body?.data?.nvrs;
      const arr = Array.isArray(list) ? list : [];
      if (arr.length === 0) {
        toast.error('No NVR found to manage cameras.');
        return;
      }
      setNvrs(arr);
      if (arr.length === 1) {
        setActiveNvrId(arr[0]._id);
      } else {
        setPickingNvr(true);
      }
    } catch {
      toast.error('Failed to load NVRs. Please try again.');
    } finally {
      setLoadingNvrs(false);
    }
  };

  const closeModal = () => setActiveNvrId(null);

  // On save, close the modal and tell any mounted NVR settings page to re-fetch
  // so its Total Cameras / cameraCount reflects the change. The lock itself
  // clears when the backend re-emits the limit (added <= purchased).
  const handleSaved = () => {
    setActiveNvrId(null);
    window.dispatchEvent(new Event('nvr-cameras-changed'));
  };

  return (
    <>
      <div
        className="fixed inset-0 z-9990 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="camera-limit-title"
      >
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl sm:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <TriangleAlert className="h-7 w-7 text-red-500" strokeWidth={2} />
          </div>

          <h2 id="camera-limit-title" className="mb-2 text-lg font-semibold text-[#333333] sm:text-xl">
            {unlicensed ? 'No Camera License' : 'Camera Limit Exceeded'}
          </h2>

          {unlicensed ? (
            <>
              <p className="mb-5 text-sm text-gray-600">
                You do not have any camera license. Please contact support to enable cameras.
              </p>

              <div className="flex gap-2.5 rounded-lg border border-[#80808033] bg-[#F5F9FF] p-3 text-left">
                <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" strokeWidth={2} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#333333]">Contact support</p>
                  {supportEmail || supportPhone ? (
                    <div className="mt-1 flex flex-col gap-1">
                      {supportEmail && (
                        <a href={`mailto:${supportEmail}`} className="inline-flex items-center gap-1.5 text-xs text-[#07486A]">
                          <Mail className="h-3.5 w-3.5" strokeWidth={2} />
                          {supportEmail}
                        </a>
                      )}
                      {supportPhone && (
                        <a href={`tel:${supportPhone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 text-xs text-[#07486A]">
                          <Phone className="h-3.5 w-3.5" strokeWidth={2} />
                          {supportPhone}
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                      Reach out to your VideorAIQ support contact to have cameras added to your license.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="mb-1 text-sm text-gray-600">
                You have added <span className="font-semibold text-[#333333]">{added}</span> cameras but
                your plan allows only{' '}
                <span className="font-semibold text-[#333333]">{purchasedCameras}</span>.
              </p>
              <p className="mb-6 text-sm text-gray-600">
                Please remove{' '}
                <span className="font-semibold text-red-600">
                  {excess} camera{excess === 1 ? '' : 's'}
                </span>{' '}
                to continue using the application.
              </p>
            </>
          )}

          {/* Multi-NVR picker — shown only when the client has more than one NVR.
              Never in the unlicensed state: removing cameras cannot grant a licence. */}
          {unlicensed ? null : pickingNvr ? (
            <div className="space-y-2 text-left">
              <p className="mb-1 text-center text-xs font-medium text-gray-500">
                Select an NVR to manage its cameras
              </p>
              {nvrs.map((nvr) => (
                <button
                  key={nvr._id}
                  type="button"
                  onClick={() => {
                    setPickingNvr(false);
                    setActiveNvrId(nvr._id);
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-[#80808059] px-4 py-2.5 text-sm text-[#333333] transition-colors hover:bg-[#F5F9FF]"
                >
                  <span className="truncate">{nvr.nvrName || 'NVR'}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleManageClick}
              disabled={loadingNvrs}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#07486A] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loadingNvrs ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              ) : (
                <VideoOff className="h-4 w-4" strokeWidth={2} />
              )}
              Manage Cameras
            </button>
          )}
        </div>
      </div>

      {/* Manage Cameras modal, layered above the lock. On save the backend
          re-emits the limit, which auto-clears this lock when in balance. */}
      {activeNvrId && (
        <div className="fixed inset-0 z-9999">
          <CameraDiscoveryModal
            nvrId={activeNvrId}
            onClose={closeModal}
            onSaved={handleSaved}
          />
        </div>
      )}
    </>
  );
};

export default CameraLimitLock;
